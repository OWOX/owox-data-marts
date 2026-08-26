import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CalculatedFieldValidatorService } from '../calculated-fields/calculated-field-validator.service';
import { createFormulaFunctionDialectRegistry } from '../calculated-fields/formula-function-dialect';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { storageFieldTypesFor } from '../data-storage-types/field-aggregation';
import {
  ValidateFormulaCommand,
  type DraftCalculatedField,
} from '../dto/domain/validate-formula.command';
import { ValidateFormulaService } from './validate-formula.service';

interface FieldSpec {
  name: string;
  type: string;
  calculated?: { formula: string; level: 'metric' };
}

const schemaWith = (fields: FieldSpec[]) => ({
  type: 'bigquery-data-mart-schema',
  fields: fields.map(f => ({
    status: DataMartSchemaFieldStatus.CONNECTED,
    mode: 'NULLABLE',
    ...f,
  })),
});

const blendable = (opts: {
  sources?: { aliasPath: string }[];
  fields?: { aliasPath: string; originalFieldName: string }[];
}) => ({
  nativeFields: [],
  blendedFields: (opts.fields ?? []).map(f => ({ isHidden: false, isCalculated: false, ...f })),
  availableSources: (opts.sources ?? []).map(s => ({
    isIncluded: true,
    isAccessibleForReporting: true,
    ...s,
  })),
  calculatedFieldIssues: [],
});

const command = (overrides: Partial<Record<string, unknown>> = {}) =>
  new ValidateFormulaCommand(
    (overrides.dataMartId as string) ?? 'target-1',
    (overrides.projectId as string) ?? 'project-1',
    (overrides.name as string) ?? 'ctr',
    (overrides.type as string) ?? 'FLOAT',
    (overrides.formula as string) ?? 'SUM({{ref field="clicks"}})',
    overrides.userId === undefined ? 'user-9' : (overrides.userId as string),
    (overrides.roles as string[]) ?? ['editor'],
    overrides.calculatedFields as DraftCalculatedField[] | undefined
  );

describe('ValidateFormulaService', () => {
  // The storage carries a CONFIG on purpose: this is a Data Mart whose SAVE would run the
  // warehouse dry run, so an untouched dry-run facade below is evidence about this endpoint, not
  // about a Data Mart that could never have reached the warehouse anyway.
  const buildService = (opts: {
    validate?: jest.Mock;
    schema?: unknown;
    canAccess?: boolean;
    blendableSchema?: ReturnType<typeof blendable>;
    storageType?: DataStorageType;
  }) => {
    const dataMart = {
      id: 'target-1',
      projectId: 'project-1',
      storage: {
        type: opts.storageType ?? DataStorageType.GOOGLE_BIGQUERY,
        config: { type: 'google-bigquery-config', projectId: 'p', location: 'US' },
      },
      schema: 'schema' in opts ? opts.schema : schemaWith([{ name: 'clicks', type: 'INTEGER' }]),
    };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(opts.canAccess ?? true),
    };
    const composer = { composeMetricsOnly: jest.fn() };
    const dryRunFacade = { execute: jest.fn() };
    const blendableSchemaService = {
      computeBlendableSchema: jest.fn().mockResolvedValue(opts.blendableSchema ?? blendable({})),
    };
    // Either a stub that records HOW the validator was called, or the REAL validator, so the
    // messages this endpoint returns are the ones the save produces rather than a spec's idea
    // of them.
    const validator = opts.validate
      ? ({ validate: opts.validate } as unknown as CalculatedFieldValidatorService)
      : new CalculatedFieldValidatorService(
          createFormulaFunctionDialectRegistry(),
          composer as never,
          dryRunFacade as never,
          blendableSchemaService as never
        );

    const service = new ValidateFormulaService(
      dataMartService as never,
      accessDecisionService as never,
      validator
    );
    return {
      service,
      dataMart,
      dataMartService,
      accessDecisionService,
      composer,
      dryRunFacade,
      blendableSchemaService,
    };
  };

  it('asks the validator for the parser pass alone, with no dry-run context', async () => {
    const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
    const { service } = buildService({ validate });

    await service.run(command());

    expect(validate).toHaveBeenCalledTimes(1);
    const [, storageType, ctx] = validate.mock.calls[0];
    expect(storageType).toBe(DataStorageType.GOOGLE_BIGQUERY);
    // The third argument is what makes the warehouse run at all — omitting it is the whole
    // mechanism by which this endpoint stays off the warehouse.
    expect(ctx).toBeUndefined();
  });

  it("threads the caller's own accessor into the join-tree context", async () => {
    const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
    const { service } = buildService({ validate });

    await service.run(command({ userId: 'user-9', roles: ['editor'] }));

    const [, , , joinTree] = validate.mock.calls[0];
    expect(joinTree).toEqual({
      dataMartId: 'target-1',
      projectId: 'project-1',
      accessor: { userId: 'user-9', roles: ['editor'] },
    });
  });

  it('never touches the warehouse, not even for a Data Mart whose storage is configured', async () => {
    const { service, dryRunFacade, composer } = buildService({});

    const result = await service.run(command());

    expect(result.errors).toEqual([]);
    expect(dryRunFacade.execute).not.toHaveBeenCalled();
    // Composing is not free either: on the blended path it resolves table references, which for a
    // SQL-defined Data Mart is a CREATE OR REPLACE VIEW against the customer's warehouse.
    expect(composer.composeMetricsOnly).not.toHaveBeenCalled();
  });

  it('appends the field when the name is new, so a sibling reference resolves', async () => {
    const { service } = buildService({});

    const result = await service.run(
      command({ name: 'ctr', formula: 'SUM({{ref field="clicks"}})' })
    );

    expect(result.errors).toEqual([]);
  });

  // At save time a field submitted under an existing name REPLACES that field, so a formula naming
  // it is naming itself. The refusal that MEANS that is the cycle one; the calculated-field refusal
  // that used to accompany it caught this only INCIDENTALLY and lifted with the feature. What now
  // stands beside it is a second true statement — the self-reference reads as an aggregate-level
  // calculated field, which `SUM(...)` may not wrap.
  //
  // This one does NOT establish that the probe replaces rather than appends: references resolve
  // through `new Map(...)` in the validator, which is last-wins, so an appended probe shadows the
  // column it collides with and produces these identical violations either way. The test below is
  // the one that can tell them apart.
  it('refuses a formula that names the field it is being saved as', async () => {
    const { service } = buildService({});

    const result = await service.run(
      command({ name: 'clicks', formula: 'SUM({{ref field="clicks"}})' })
    );

    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'FORMULA_CIRCULAR_REFERENCE', field: 'clicks' }),
      expect.objectContaining({ code: 'FORMULA_AGGREGATE_ON_AGGREGATE', field: 'clicks' }),
    ]);
  });

  // Substitution, not blind appending — and a fixture that can prove it. The persisted `ctr` is
  // BROKEN: substituted, its formula is gone and there is nothing left to report; appended, the
  // stale formula stays in the probe schema, is validated beside the new one, and its violation
  // comes back under the very name being edited.
  it('replaces a field of the same name rather than adding a second one', async () => {
    const { service } = buildService({
      schema: schemaWith([
        { name: 'clicks', type: 'INTEGER' },
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field="spend"}})', level: 'metric' },
        },
      ]),
    });

    const result = await service.run(
      command({ name: 'ctr', formula: 'SUM({{ref field="clicks"}})' })
    );

    expect(result.errors).toEqual([]);
    expect(result.otherFieldErrors).toEqual([]);
  });

  /**
   * The Output Schema editor is deferred-save, so the feature's headline flow — add `revenue`, add
   * `cost`, then write `roas = revenue / cost`, all before pressing Save — asks about two siblings
   * that exist nowhere on disk. Judged against the persisted schema alone, the live panel answered
   * "`revenue` no longer exists in the Data Mart" and marked up the very reference the save then
   * accepted: the loudest possible way to tell an analyst their new feature does not work.
   */
  describe('the calculated fields the editor is holding', () => {
    it('resolves a sibling that exists only in the draft', async () => {
      const { service } = buildService({
        schema: schemaWith([
          { name: 'clicks', type: 'INTEGER' },
          { name: 'spend', type: 'FLOAT' },
        ]),
      });

      const result = await service.run(
        command({
          name: 'roas',
          formula: '{{ref field="revenue"}} / {{ref field="cost"}}',
          calculatedFields: [
            { name: 'revenue', type: 'FLOAT', formula: 'SUM({{ref field="clicks"}})' },
            { name: 'cost', type: 'FLOAT', formula: 'SUM({{ref field="spend"}})' },
          ],
        })
      );

      expect(result.errors).toEqual([]);
      expect(result.otherFieldErrors).toEqual([]);
    });

    // The draft is the whole truth about this Data Mart's formulas, not an addition to the
    // persisted set: a metric deleted in this session will not be saved, so its breakage is not a
    // reason the save fails and must not be reported as one.
    it('drops a persisted formula the editor no longer holds', async () => {
      const { service } = buildService({
        schema: schemaWith([
          { name: 'clicks', type: 'INTEGER' },
          {
            name: 'deleted_here',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="gone"}})', level: 'metric' },
          },
        ]),
      });

      const result = await service.run(
        command({
          name: 'ctr',
          calculatedFields: [
            { name: 'ctr', type: 'FLOAT', formula: 'SUM({{ref field="clicks"}})' },
          ],
        })
      );

      expect(result.otherFieldErrors).toEqual([]);
    });

    // The popover's buffer is newer than the row's applied formula, so the same name arrives twice:
    // once in the draft, once as the thing being asked about. Judged as two fields, the stale
    // copy's violations come back under the submitted name and read as accusations about the
    // formula on screen.
    it('lets the submitted formula replace the draft entry of the same name', async () => {
      const { service } = buildService({});

      const result = await service.run(
        command({
          name: 'ctr',
          formula: 'SUM({{ref field="clicks"}})',
          calculatedFields: [{ name: 'ctr', type: 'FLOAT', formula: 'SUM({{ref field="gone"}})' }],
        })
      );

      expect(result.errors).toEqual([]);
      expect(result.otherFieldErrors).toEqual([]);
    });

    // Same trap through the other door: the draft may name a formula after a column that is still
    // in the persisted schema. One name, one field — otherwise the probe carries two `clicks` and
    // the submitted formula merges into whichever comes first.
    it('lets a draft formula replace a persisted column of the same name', async () => {
      const { service } = buildService({
        schema: schemaWith([
          { name: 'clicks', type: 'INTEGER' },
          { name: 'spend', type: 'FLOAT' },
        ]),
      });

      const result = await service.run(
        command({
          name: 'clicks',
          formula: 'SUM({{ref field="spend"}})',
          calculatedFields: [
            { name: 'clicks', type: 'FLOAT', formula: 'SUM({{ref field="gone"}})' },
          ],
        })
      );

      expect(result.errors).toEqual([]);
      expect(result.otherFieldErrors).toEqual([]);
    });

    /**
     * The draft is client-supplied, and every type in it describes a field the SAVE would have to
     * accept. The submitted field's own type is checked; without this its siblings' were not, so a
     * schema the save refuses came back from the live channel clean — the live-versus-save
     * disagreement this endpoint exists to remove.
     */
    it('reports a draft sibling whose type the storage does not know, under that sibling', async () => {
      const { service } = buildService({});

      const result = await service.run(
        command({
          name: 'roas',
          formula: '{{ref field="revenue"}} / 2',
          calculatedFields: [
            { name: 'revenue', type: 'BANANA', formula: 'SUM({{ref field="clicks"}})' },
          ],
        })
      );

      expect(result.otherFieldErrors).toEqual([
        expect.objectContaining({
          code: 'FORMULA_FIELD_TYPE_NOT_SUPPORTED',
          field: 'revenue',
          subject: 'BANANA',
        }),
      ]);
      // The formula on screen is still judged: an unspellable type belongs to another row, and
      // stopping here would answer nothing about the one the analyst has open.
      expect(result.errors).toEqual([]);
    });

    it('says nothing about the submitted field’s own draft copy, which it overwrites anyway', () => {
      // Its type comes from `command.type` — checked on its own, and written over the draft entry
      // by the probe, so the draft's copy describes nothing that will be judged.
      const { service } = buildService({});

      return expect(
        service.run(
          command({
            name: 'ctr',
            type: 'FLOAT',
            calculatedFields: [
              { name: 'ctr', type: 'BANANA', formula: 'SUM({{ref field="clicks"}})' },
            ],
          })
        )
      ).resolves.toEqual(expect.objectContaining({ otherFieldErrors: [] }));
    });

    // A caller with no draft to report — a read-only table, an API client — must fall back to the
    // persisted schema. Reading an empty list as "this Data Mart has no formulas" would delete
    // every persisted sibling from the check and produce the exact error this feature removes.
    it('falls back to the persisted schema when the draft list is empty', async () => {
      const { service } = buildService({
        schema: schemaWith([
          { name: 'clicks', type: 'INTEGER' },
          {
            name: 'revenue',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
          },
        ]),
      });

      const result = await service.run(
        command({ name: 'roas', formula: '{{ref field="revenue"}} / 2', calculatedFields: [] })
      );

      expect(result.errors).toEqual([]);
    });
  });

  it('reports the same structural violations the save would', async () => {
    const { service } = buildService({});

    const result = await service.run(command({ formula: 'SUM(SUM({{ref field="clicks"}}))' }));

    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'FORMULA_NESTED_AGGREGATE', field: 'ctr' }),
    ]);
  });

  // Other formulas belong to other rows. They stay IN the probe schema — a formula may
  // read one, so dropping them would report a legal reference as an unknown field — but a problem
  // that PREDATES this edit is not this row's error.
  //
  // Where it DOES land is the point of the second assertion: `otherFieldErrors` carries it, with no
  // baseline separating "this edit broke it" from "it was already broken". That is deliberate —
  // establishing causation means validating the persisted schema on every keystroke as well — and
  // it is why nothing built on this bucket may claim the edit is the cause.
  it('keeps another formula’s pre-existing breakage out of the edited row', async () => {
    const { service } = buildService({
      schema: schemaWith([
        { name: 'clicks', type: 'INTEGER' },
        {
          name: 'roas',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field="spend"}})', level: 'metric' },
        },
      ]),
    });

    const result = await service.run(command({ name: 'ctr' }));

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.otherFieldErrors).toEqual([
      expect.objectContaining({ code: 'FORMULA_UNKNOWN_REFERENCE', field: 'roas' }),
    ]);
  });

  // The failure mode the whole design exists to prevent: attribution follows the OWNING formula,
  // not the CAUSING one. Turning `impressions` into a metric is legal on its own terms and breaks
  // `roas`, whose violation is filed under `roas` — so scoping the answer to the edited field
  // alone would show a green editor and then a 400 on Save, naming a metric never opened.
  it('reports what saving this formula would break elsewhere', async () => {
    const { service } = buildService({
      schema: schemaWith([
        { name: 'clicks', type: 'INTEGER' },
        { name: 'impressions', type: 'INTEGER' },
        {
          name: 'roas',
          type: 'FLOAT',
          calculated: {
            formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
            level: 'metric',
          },
        },
      ]),
    });

    const result = await service.run(
      command({ name: 'impressions', formula: 'SUM({{ref field="clicks"}}) * 2' })
    );

    expect(result.errors).toEqual([]);
    // `roas` MAY read `impressions` — what it may not do is wrap an aggregate-level
    // formula in another aggregate. The code changed with the feature; the attribution, which is
    // what this test is about, did not.
    expect(result.otherFieldErrors).toEqual([
      expect.objectContaining({ code: 'FORMULA_AGGREGATE_ON_AGGREGATE', field: 'roas' }),
    ]);
  });

  // Other fields' WARNINGS are dropped rather than bucketed: an advisory about a formula nobody
  // opened is noise, and unlike an error it costs nothing at save time. No fixture produced a
  // sibling warning until this one, so that rule survived being reversed in either direction —
  // returning them under `warnings` (as the edited row's own) or filing them as collateral.
  it('drops another field’s advisory warning rather than bucketing it', async () => {
    const { service } = buildService({
      schema: schemaWith([
        { name: 'clicks', type: 'INTEGER' },
        { name: 'impressions', type: 'INTEGER' },
        {
          name: 'roas',
          type: 'FLOAT',
          calculated: {
            formula: 'SUM({{ref field="clicks"}}) / SUM({{ref field="impressions"}})',
            level: 'metric',
          },
        },
      ]),
    });

    const result = await service.run(
      command({ name: 'ctr', formula: 'SUM({{ref field="clicks"}})' })
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.otherFieldErrors).toEqual([]);
  });

  // `fields` is typed as required but lives in a JSON column: a hand-written or half-migrated row
  // can arrive without it, and the unguarded path throws a TypeError where the analyst should be
  // getting an answer about their formula.
  it('treats a persisted schema carrying no fields at all as an empty one', async () => {
    const { service } = buildService({ schema: { type: 'bigquery-data-mart-schema' } });

    const result = await service.run(command({ formula: 'SUM({{ref field="clicks"}})' }));

    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'FORMULA_UNKNOWN_REFERENCE', field: 'ctr' }),
    ]);
  });

  it('returns the advisory warnings for the field being edited', async () => {
    const { service } = buildService({
      schema: schemaWith([
        { name: 'clicks', type: 'INTEGER' },
        { name: 'impressions', type: 'INTEGER' },
      ]),
    });

    const result = await service.run(
      command({ formula: 'SUM({{ref field="clicks"}}) / SUM({{ref field="impressions"}})' })
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'FORMULA_UNGUARDED_DIVISION', field: 'ctr' }),
    ]);
  });

  // A calculated field has no columns under it, and no save can produce a field that is both a
  // RECORD and a formula — so the replaced field's children must not survive the substitution.
  // Left in, `event.clicks` would still resolve here and then vanish the moment the save lands.
  it('drops the replaced field’s nested children', async () => {
    const { service } = buildService({
      schema: {
        type: 'bigquery-data-mart-schema',
        fields: [
          {
            name: 'event',
            type: 'RECORD',
            mode: 'NULLABLE',
            status: DataMartSchemaFieldStatus.CONNECTED,
            fields: [
              {
                name: 'clicks',
                type: 'INTEGER',
                mode: 'NULLABLE',
                status: DataMartSchemaFieldStatus.CONNECTED,
              },
            ],
          },
        ],
      },
    });

    const result = await service.run(
      command({ name: 'event', formula: 'SUM({{ref field="event.clicks"}})' })
    );

    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'FORMULA_UNKNOWN_REFERENCE', field: 'event' }),
    ]);
  });

  // The same vocabulary the schema save enforces, read from the same enums: a type the storage
  // does not know must not come back clean here and then 400 on Save.
  //
  // Reported, never thrown. This channel's contract is that a broken formula is an ANSWER: a
  // non-200 leaves the editor's panel empty, which reads as "clean", and three of them disable the
  // channel client-side for the session.
  it('reports a field type the storage does not know, without failing the request', async () => {
    const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
    const { service } = buildService({ validate });

    await expect(service.run(command({ type: 'BANANA' }))).resolves.toEqual({
      errors: [
        expect.objectContaining({
          code: 'FORMULA_FIELD_TYPE_NOT_SUPPORTED',
          field: 'ctr',
          subject: 'BANANA',
        }),
      ],
      warnings: [],
      otherFieldErrors: [],
    });

    expect(validate).not.toHaveBeenCalled();
  });

  // This check ran against BigQuery alone, in this file and nowhere else, under a title claiming
  // "every field type" while asserting one. That is how it stayed unnoticed that Snowflake's web
  // type list offers 35 spellings against the 11 this enum holds — `VARCHAR`, the type every new
  // Snowflake metric row is born with, among the missing.
  describe.each([
    [DataStorageType.GOOGLE_BIGQUERY],
    [DataStorageType.LEGACY_GOOGLE_BIGQUERY],
    [DataStorageType.AWS_ATHENA],
    [DataStorageType.SNOWFLAKE],
    [DataStorageType.AWS_REDSHIFT],
    [DataStorageType.DATABRICKS],
  ])('field types of %s', storageType => {
    it('validates the formula for every type that storage knows', async () => {
      const known = [...storageFieldTypesFor(storageType)];
      expect(known.length).toBeGreaterThan(0);

      for (const type of known) {
        const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
        const { service } = buildService({ validate, storageType });

        await expect(service.run(command({ type }))).resolves.toEqual({
          errors: [],
          warnings: [],
          otherFieldErrors: [],
        });
        expect(validate).toHaveBeenCalledTimes(1);
      }
    });
  });

  // The regression itself, spelled out rather than left implicit in the loop above: the type the
  // Snowflake table hands a brand-new Calculated Field row is one this enum does not carry, and
  // the analyst has to be TOLD that rather than shown an empty panel.
  it('answers, rather than throws, for the type a new Snowflake metric row is born with', async () => {
    const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
    const { service } = buildService({ validate, storageType: DataStorageType.SNOWFLAKE });

    const result = await service.run(command({ type: 'VARCHAR' }));

    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'FORMULA_FIELD_TYPE_NOT_SUPPORTED', subject: 'VARCHAR' }),
    ]);
  });

  // `validate` rewrites the formulas it accepts IN PLACE (canonical spelling). The Data Mart it is
  // handed here is a loaded entity; nothing here saves it and a `findOne` result is not
  // change-tracked, so the damage would be confined to this request — but a formula nobody
  // submitted, sitting on the entity for whatever reads it next, is still a trap.
  it("leaves the loaded Data Mart's own schema untouched", async () => {
    const persisted = schemaWith([
      { name: 'clicks', type: 'INTEGER' },
      {
        name: 'roas',
        type: 'FLOAT',
        calculated: { formula: "SUM({{ref   field='clicks'  }})", level: 'metric' },
      },
    ]);
    const { service, dataMart } = buildService({ schema: persisted });
    const before = structuredClone(persisted);

    await service.run(command());

    expect(dataMart.schema).toEqual(before);
  });

  it('resolves a joined path with the caller’s accessor, never a fabricated one', async () => {
    const { service, blendableSchemaService } = buildService({
      blendableSchema: blendable({
        sources: [{ aliasPath: 'orders' }],
        fields: [{ aliasPath: 'orders', originalFieldName: 'amount' }],
      }),
    });

    const result = await service.run(
      command({ formula: 'SUM({{ref path="orders" field="amount"}})' })
    );

    expect(result.errors).toEqual([]);
    expect(blendableSchemaService.computeBlendableSchema).toHaveBeenCalledWith(
      'target-1',
      'project-1',
      { userId: 'user-9', roles: ['editor'] }
    );
  });

  it('refuses a joined path that names no source', async () => {
    const { service } = buildService({});

    const result = await service.run(
      command({ formula: 'SUM({{ref path="orders" field="amount"}})' })
    );

    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'FORMULA_JOINED_PATH_NOT_FOUND', field: 'ctr' }),
    ]);
  });

  // A Data Mart whose schema was never actualized still gets an answer about the formula's shape.
  it('still checks the structure when the Data Mart has no persisted schema', async () => {
    const { service } = buildService({ schema: undefined });

    const result = await service.run(command({ formula: 'SUM(SUM({{ref field="clicks"}}))' }));

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FORMULA_NESTED_AGGREGATE', field: 'ctr' }),
      ])
    );
  });

  // EDIT, not SEE: this endpoint answers "would the save I am about to make be accepted", so the
  // people who may ask are the people who may make that save — the same action
  // `UpdateDataMartSchemaService` checks, and the level the route guard already required. The
  // three layers used to state two different contracts, with the published one the weakest.
  it('refuses a Data Mart the caller cannot edit, without validating anything', async () => {
    const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
    const { service, accessDecisionService } = buildService({ validate, canAccess: false });

    await expect(service.run(command())).rejects.toBeInstanceOf(ForbiddenException);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-9',
      ['editor'],
      expect.anything(),
      'target-1',
      'EDIT',
      'project-1'
    );
    expect(validate).not.toHaveBeenCalled();
  });

  it('refuses a request carrying no user identity', async () => {
    const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
    const { service, dataMartService } = buildService({ validate });

    await expect(service.run(command({ userId: '' }))).rejects.toBeInstanceOf(
      UnauthorizedException
    );

    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });
  /**
   * This bucket is a nudge under a formula the analyst is still typing, not a report. One field
   * contributes one violation per broken reference, so a schema of broken formulas turns a request
   * bounded at 1 MB into an answer measured in megabytes — and nothing downstream collapses them,
   * because each message names its own reference.
   */
  describe('the collateral list is bounded', () => {
    const brokenField = (name: string, refs: number) => ({
      name,
      type: 'FLOAT',
      calculated: {
        formula: Array.from(
          { length: refs },
          (_, i) => `SUM({{ref field="gone_${String(i)}"}})`
        ).join(' + '),
        level: 'metric' as const,
      },
    });

    it('keeps at most three problems from any one field', async () => {
      const { service } = buildService({
        schema: schemaWith([{ name: 'clicks', type: 'INTEGER' }, brokenField('roas', 5)]),
      });

      const result = await service.run(
        command({ name: 'ctr', formula: 'SUM({{ref field="clicks"}})' })
      );

      // The notice below carries a field too, the way `warehouseCheckSkipped` does — count the
      // problems themselves.
      expect(
        result.otherFieldErrors.filter(v => v.code === 'FORMULA_UNKNOWN_REFERENCE')
      ).toHaveLength(3);
      expect(result.otherFieldErrors.at(-1)).toEqual(
        expect.objectContaining({ code: 'FORMULA_OTHER_FIELD_ERRORS_TRUNCATED' })
      );
      // The formula the analyst has open is judged in full, whatever the collateral did.
      expect(result.errors).toEqual([]);
    });

    it('keeps at most fifty problems in all, and says how many it dropped', async () => {
      const broken = Array.from({ length: 60 }, (_, i) => brokenField(`m_${String(i)}`, 1));
      const { service } = buildService({
        schema: schemaWith([{ name: 'clicks', type: 'INTEGER' }, ...broken]),
      });

      const result = await service.run(
        command({ name: 'ctr', formula: 'SUM({{ref field="clicks"}})' })
      );

      // Fifty kept, plus the one line saying the list was cut.
      expect(result.otherFieldErrors).toHaveLength(51);
      const notice = result.otherFieldErrors.at(-1);
      expect(notice?.code).toBe('FORMULA_OTHER_FIELD_ERRORS_TRUNCATED');
      expect(notice?.message).toContain('10 more problems');
    });

    // Breadth beats depth: which fields this edit breaks is the useful fact, so the cap must not be
    // spent on one field's fourth broken reference.
    it('spends the budget on distinct fields rather than on one field', async () => {
      const broken = Array.from({ length: 30 }, (_, i) => brokenField(`m_${String(i)}`, 10));
      const { service } = buildService({
        schema: schemaWith([{ name: 'clicks', type: 'INTEGER' }, ...broken]),
      });

      const result = await service.run(
        command({ name: 'ctr', formula: 'SUM({{ref field="clicks"}})' })
      );

      const fields = new Set(
        result.otherFieldErrors
          .filter(v => v.code !== 'FORMULA_OTHER_FIELD_ERRORS_TRUNCATED')
          .map(v => v.field)
      );
      expect(fields.size).toBeGreaterThan(10);
    });

    it('says nothing extra when the list fits', async () => {
      const { service } = buildService({
        schema: schemaWith([{ name: 'clicks', type: 'INTEGER' }, brokenField('roas', 1)]),
      });

      const result = await service.run(
        command({ name: 'ctr', formula: 'SUM({{ref field="clicks"}})' })
      );

      expect(result.otherFieldErrors).toHaveLength(1);
      expect(result.otherFieldErrors[0].code).not.toBe('FORMULA_OTHER_FIELD_ERRORS_TRUNCATED');
    });
  });
});
