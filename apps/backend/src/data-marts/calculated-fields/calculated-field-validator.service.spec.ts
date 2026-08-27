import {
  CalculatedFieldValidatorService,
  DryRunContext,
} from './calculated-field-validator.service';
import { createFormulaFunctionDialectRegistry } from './formula-function-dialect';
import type { CalculatedFieldLevel } from './formula-level';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import type { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { UNIQUE_COUNT_FIELD_TOKEN } from '../dto/schemas/unique-count-sources';
import { SqlDryRunResult } from '../dto/domain/sql-dry-run-result.dto';
import { BadRequestException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { BigQueryQueryBuilder } from '../data-storage-types/bigquery/services/bigquery-query.builder';
import { BigQueryClauseRenderer } from '../data-storage-types/bigquery/services/bigquery-clause-renderer';
import type { FormulaViolation } from './formula-violations';

interface FieldSpec {
  name: string;
  type: string;
  status?: DataMartSchemaFieldStatus;
  isHiddenForReporting?: boolean;
  // Optional and widened to the whole vocabulary so a spec can play a client sending the WRONG
  // level, or none at all — both shapes the wire now accepts, and both overwritten by the derivation.
  calculated?: { formula: string; level?: CalculatedFieldLevel };
}

const schemaWith = (fields: FieldSpec[]): DataMartSchema =>
  ({
    type: 'bigquery-data-mart-schema',
    fields: fields.map(f => ({ status: DataMartSchemaFieldStatus.CONNECTED, ...f })),
  }) as unknown as DataMartSchema;

// No-op doubles for the collaborators the shared `validator` below never reaches: it is called
// without a dry-run context (so the warehouse phase is skipped) and without a join-tree context
// (so no blendable schema is read). These stubs exist purely so the constructor is satisfied.
const noopComposer = { composeMetricsOnly: jest.fn() };
const noopDryRunFacade = { execute: jest.fn() };
const noopBlendableSchema = { computeBlendableSchema: jest.fn() };

describe('CalculatedFieldValidatorService', () => {
  const validator = new CalculatedFieldValidatorService(
    createFormulaFunctionDialectRegistry(),
    noopComposer as never,
    noopDryRunFacade as never,
    noopBlendableSchema as never
  );

  it('reports violations from every calculated field in one pass', async () => {
    const result = await validator.validate(
      schemaWith([
        { name: 'clicks', type: 'INTEGER' },
        {
          name: 'a',
          type: 'FLOAT',
          calculated: {
            formula: 'SUM({{ref field="clicks"}}) + {{ref field="clicks"}}',
            level: 'metric',
          },
        },
        {
          name: 'b',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field="gone"}})', level: 'metric' },
        },
      ]),
      DataStorageType.GOOGLE_BIGQUERY
    );
    expect(result.errors.map(e => [e.field, e.code])).toEqual([
      ['a', 'FORMULA_LEVEL_MIXING'],
      ['b', 'FORMULA_UNKNOWN_REFERENCE'],
    ]);
  });

  it('resolves references against the same schema being saved — a field added in this save is referenceable', async () => {
    const result = await validator.validate(
      schemaWith([
        { name: 'clicks', type: 'INTEGER' },
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        },
      ]),
      DataStorageType.GOOGLE_BIGQUERY
    );
    expect(result.errors).toEqual([]);
  });

  it('fails a reference to a field removed in this very save', async () => {
    // "clicks" is absent from the schema being saved — only "ctr" is present.
    const result = await validator.validate(
      schemaWith([
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        },
      ]),
      DataStorageType.GOOGLE_BIGQUERY
    );
    expect(result.errors).toEqual([
      expect.objectContaining({ field: 'ctr', code: 'FORMULA_UNKNOWN_REFERENCE' }),
    ]);
  });

  it('does not report a valid calculated field alongside an invalid one', async () => {
    const result = await validator.validate(
      schemaWith([
        { name: 'clicks', type: 'INTEGER' },
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        },
        {
          name: 'bad',
          type: 'FLOAT',
          calculated: {
            formula: 'SUM({{ref field="clicks"}}) + {{ref field="clicks"}}',
            level: 'metric',
          },
        },
      ]),
      DataStorageType.GOOGLE_BIGQUERY
    );
    expect(result.errors).toEqual([
      expect.objectContaining({ field: 'bad', code: 'FORMULA_LEVEL_MIXING' }),
    ]);
  });

  it('returns no violations and never resolves a dialect when the schema has no calculated fields', async () => {
    const dialects = { resolve: jest.fn() };
    const noDialectValidator = new CalculatedFieldValidatorService(
      dialects as never,
      noopComposer as never,
      noopDryRunFacade as never,
      noopBlendableSchema as never
    );

    const result = await noDialectValidator.validate(
      schemaWith([{ name: 'clicks', type: 'INTEGER' }]),
      DataStorageType.GOOGLE_BIGQUERY
    );

    expect(result).toEqual({ errors: [], warnings: [] });
    expect(dialects.resolve).not.toHaveBeenCalled();
  });

  describe('hidden fields', () => {
    it('resolves a formula referencing a hidden field — hidden takes it off the reporting menu, not out of the source', async () => {
      const result = await validator.validate(
        schemaWith([
          { name: 'internal_id', type: 'STRING', isHiddenForReporting: true },
          {
            name: 'ctr',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="internal_id"}})', level: 'metric' },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(result.errors).toEqual([]);
    });

    it('still fails a reference to a DISCONNECTED field even when hidden fields are otherwise referenceable', async () => {
      const result = await validator.validate(
        schemaWith([
          {
            name: 'gone_col',
            type: 'STRING',
            isHiddenForReporting: true,
            status: DataMartSchemaFieldStatus.DISCONNECTED,
          },
          {
            name: 'ctr',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="gone_col"}})', level: 'metric' },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(result.errors).toEqual([
        expect.objectContaining({ field: 'ctr', code: 'FORMULA_UNKNOWN_REFERENCE' }),
      ]);
    });
  });

  describe('Unique Count token vs. a real column of the same name', () => {
    // Spec §4.3 gives the token its meaning for a JOINED source (`path` set), refused separately
    // (see the joined-source describe). A BARE one reads as the metric's own Data Mart's Unique Count
    // measure, and that has no renderable form: there is no such column, and the measure is an
    // output column of the very query the formula renders into — no dialect resolves an alias
    // from inside its own SELECT list. Accepted, it emitted a bare `unique_count` reference and
    // failed at the warehouse on every run of every report that selected the metric.
    it("rejects a bare reference to the Data Mart's own Unique Count measure", async () => {
      const result = await validator.validate(
        schemaWith([
          {
            name: 'uc_ratio',
            type: 'FLOAT',
            calculated: {
              formula: `{{ref field="${UNIQUE_COUNT_FIELD_TOKEN}"}} / SUM({{ref field="clicks"}})`,
              level: 'metric',
            },
          },
          { name: 'clicks', type: 'INTEGER' },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'uc_ratio',
          code: 'FORMULA_MAIN_UNIQUE_COUNT_REFERENCE_NOT_SUPPORTED',
          message: expect.stringContaining(UNIQUE_COUNT_FIELD_TOKEN),
        }),
      ]);
    });

    it('rejects a source Unique Count wrapped in another aggregate when no real column claims the name', async () => {
      const result = await validator.validate(
        schemaWith([
          {
            name: 'bad_uc',
            type: 'FLOAT',
            calculated: {
              formula: `SUM({{ref field="${UNIQUE_COUNT_FIELD_TOKEN}"}})`,
              level: 'metric',
            },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      // Both are true of this formula and both name the field: it cannot be referenced at all,
      // and even if it could it is already an aggregate.
      expect(result.errors.map(e => e.code).sort()).toEqual([
        'FORMULA_AGGREGATE_ON_AGGREGATE',
        'FORMULA_MAIN_UNIQUE_COUNT_REFERENCE_NOT_SUPPORTED',
      ]);
      expect(result.errors.every(e => e.field === 'bad_uc')).toBe(true);
    });

    it('treats a real column literally named "unique_count" as an ordinary column, not the measure', async () => {
      const result = await validator.validate(
        schemaWith([
          { name: UNIQUE_COUNT_FIELD_TOKEN, type: 'INTEGER' },
          {
            name: 'ctr',
            type: 'FLOAT',
            calculated: {
              formula: `SUM({{ref field="${UNIQUE_COUNT_FIELD_TOKEN}"}})`,
              level: 'metric',
            },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      // A genuine column named "unique_count" wraps in SUM like any other row-level column — no
      // FORMULA_AGGREGATE_ON_AGGREGATE, because the schema is consulted before the token is.
      expect(result.errors).toEqual([]);
    });

    it('accepts a bare reference to a real "unique_count" column — it is an ordinary column, not the measure', async () => {
      const result = await validator.validate(
        schemaWith([
          { name: UNIQUE_COUNT_FIELD_TOKEN, type: 'INTEGER' },
          {
            name: 'row_level',
            type: 'INTEGER',
            calculated: {
              formula: `{{ref field="${UNIQUE_COUNT_FIELD_TOKEN}"}}`,
              level: 'metric',
            },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      // Read as the MEASURE this would be FORMULA_MAIN_UNIQUE_COUNT_REFERENCE_NOT_SUPPORTED; read as
      // the real column it is an ordinary row-level formula, which is legal.
      expect(result.errors).toEqual([]);
    });
  });

  describe('joined-source references', () => {
    // The blendable schema is the same index the report builder resolves a joined path against,
    // so validating here means a formula that saves is one the builder can route.
    const blendable = (opts: {
      sources?: { aliasPath: string; isIncluded?: boolean; isAccessibleForReporting?: boolean }[];
      fields?: {
        aliasPath: string;
        originalFieldName: string;
        isHidden?: boolean;
        isCalculated?: boolean;
      }[];
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

    const ordersWithAmount = blendable({
      sources: [{ aliasPath: 'orders' }],
      fields: [{ aliasPath: 'orders', originalFieldName: 'amount' }],
    });

    const buildValidator = (blendableSchema: ReturnType<typeof blendable>) => {
      const composer = { composeMetricsOnly: jest.fn().mockResolvedValue({ sql: 'SELECT 1' }) };
      const dryRun = { execute: jest.fn().mockResolvedValue(SqlDryRunResult.success()) };
      const blendableSchemaService = {
        computeBlendableSchema: jest.fn().mockResolvedValue(blendableSchema),
      };
      return {
        validator: new CalculatedFieldValidatorService(
          createFormulaFunctionDialectRegistry(),
          composer as never,
          dryRun as never,
          blendableSchemaService as never
        ),
        blendableSchemaService,
        composer,
        dryRun,
      };
    };

    const accessor = { userId: 'user-1', roles: ['editor'] };
    const joinTree = { dataMartId: 'dm-1', projectId: 'project-1', accessor };
    const buildCtx = () =>
      ({
        dataMart: { id: 'dm-1', projectId: 'project-1' },
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        credentials: {},
        config: {},
      }) as unknown as DryRunContext;

    const metric = (formula: string, name = 'blended_metric') =>
      schemaWith([
        { name: 'clicks', type: 'INTEGER' },
        { name, type: 'FLOAT', calculated: { formula, level: 'metric' } },
      ]);

    it('accepts a reference to a joined Data Mart field, resolved against the blendable schema', async () => {
      const { validator: v, blendableSchemaService } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric('SUM({{ref field="clicks"}}) * 2 * SUM({{ref path="orders" field="amount"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([]);
      expect(blendableSchemaService.computeBlendableSchema).toHaveBeenCalledWith(
        'dm-1',
        'project-1',
        accessor
      );
      // The dry-run policy is untouched by joined resolution: still one run, still stamped.
      expect(result.warehouseValidation).toBe('passed');
    });

    it('refuses a path that names no joined source', async () => {
      const { validator: v, dryRun } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric('SUM({{ref path="ghost" field="amount"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'blended_metric',
          code: 'FORMULA_JOINED_PATH_NOT_FOUND',
          message: expect.stringContaining('ghost'),
        }),
      ]);
      expect(dryRun.execute).not.toHaveBeenCalled();
    });

    it('accepts a field of a source excluded from reporting — its join is built either way', async () => {
      // `buildRelationshipChains` is deliberately NOT filtered by `isIncluded`, which is what lets
      // a report sort by an excluded source's column. Refusing one only inside a formula would be
      // an asymmetry an analyst cannot explain: tick the column, fine; name it in a formula,
      // refused.
      const { validator: v } = buildValidator(
        blendable({
          sources: [{ aliasPath: 'orders', isIncluded: false }],
          fields: [{ aliasPath: 'orders', originalFieldName: 'amount' }],
        })
      );

      const result = await v.validate(
        metric('SUM({{ref path="orders" field="amount"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([]);
    });

    it('refuses a joined field hidden from reporting', async () => {
      const { validator: v } = buildValidator(
        blendable({
          sources: [{ aliasPath: 'orders' }],
          fields: [{ aliasPath: 'orders', originalFieldName: 'amount', isHidden: true }],
        })
      );

      const result = await v.validate(
        metric('SUM({{ref path="orders" field="amount"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'blended_metric',
          code: 'FORMULA_JOINED_FIELD_NOT_AVAILABLE',
          message: expect.stringContaining('hidden'),
        }),
      ]);
    });

    // The SAME rule, and the same code, as a reference to the metric's own Data Mart's calculated
    // field: a formula cannot read another formula. Until the blendable payload carried the flag,
    // this saved cleanly and failed at report time instead.
    it("refuses a joined Data Mart's OWN calculated field, with the same code as a local one", async () => {
      const { validator: v, dryRun } = buildValidator(
        blendable({
          sources: [{ aliasPath: 'orders' }],
          fields: [{ aliasPath: 'orders', originalFieldName: 'margin', isCalculated: true }],
        })
      );

      const result = await v.validate(
        metric('SUM({{ref path="orders" field="margin"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'blended_metric',
          code: 'FORMULA_CALCULATED_REFERENCE',
          message: expect.stringContaining('orders.margin'),
        }),
      ]);
      expect(dryRun.execute).not.toHaveBeenCalled();
    });

    // `__` is legal inside both an alias segment and a field name, so these two fold to one blended
    // column. The validator's own index is keyed structurally and cannot see that; without the
    // check the save passes and the report 400s on `buildBlendedFieldIndex` instead.
    it('refuses a joined field whose unified blended name collides with another field’s', async () => {
      const { validator: v } = buildValidator(
        blendable({
          sources: [{ aliasPath: 'users' }, { aliasPath: 'users__archived' }],
          fields: [
            { aliasPath: 'users', originalFieldName: 'archived__role' },
            { aliasPath: 'users__archived', originalFieldName: 'role' },
          ],
        })
      );

      const result = await v.validate(
        metric('SUM({{ref path="users" field="archived__role"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'blended_metric',
          code: 'FORMULA_JOINED_FIELD_AMBIGUOUS',
          message: expect.stringContaining('users__archived__role'),
        }),
      ]);
    });

    // The dry run refuses this too, but as a whole-request envelope naming no field — the metric
    // dialog renders per-field violations, so that arrived as a toast the analyst could not act on.
    it('refuses a joined source this user cannot read, as a per-field violation', async () => {
      const { validator: v, dryRun } = buildValidator(
        blendable({
          sources: [{ aliasPath: 'orders', isAccessibleForReporting: false }],
          fields: [{ aliasPath: 'orders', originalFieldName: 'amount' }],
        })
      );

      const result = await v.validate(
        metric('SUM({{ref path="orders" field="amount"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'blended_metric',
          code: 'FORMULA_JOINED_SOURCE_NOT_ACCESSIBLE',
          message: expect.stringContaining('orders.amount'),
        }),
      ]);
      expect(dryRun.execute).not.toHaveBeenCalled();
    });

    it('refuses a field the joined source does not offer', async () => {
      const { validator: v } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric('SUM({{ref path="orders" field="gone"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'blended_metric',
          code: 'FORMULA_JOINED_FIELD_NOT_AVAILABLE',
          message: expect.stringContaining('orders.gone'),
        }),
      ]);
    });

    it("refuses a joined source's Unique Count — still not referenceable in this slice", async () => {
      const { validator: v } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric(
          `{{ref path="orders" field="${UNIQUE_COUNT_FIELD_TOKEN}"}} / SUM({{ref field="clicks"}})`
        ),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'blended_metric',
          code: 'FORMULA_JOINED_UNIQUE_COUNT_REFERENCE_NOT_SUPPORTED',
        }),
      ]);
    });

    it('treats a real joined column literally named "unique_count" as an ordinary field', async () => {
      const { validator: v } = buildValidator(
        blendable({
          sources: [{ aliasPath: 'orders' }],
          fields: [{ aliasPath: 'orders', originalFieldName: UNIQUE_COUNT_FIELD_TOKEN }],
        })
      );

      const result = await v.validate(
        metric(`SUM({{ref path="orders" field="${UNIQUE_COUNT_FIELD_TOKEN}"}})`),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([]);
    });

    it('resolves a nested path exactly as the relationship tree exposes it', async () => {
      const { validator: v } = buildValidator(
        blendable({
          sources: [{ aliasPath: 'orders' }, { aliasPath: 'orders.items' }],
          fields: [{ aliasPath: 'orders.items', originalFieldName: 'qty' }],
        })
      );

      const result = await v.validate(
        metric('SUM({{ref path="orders.items" field="qty"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([]);
    });

    it('refuses one aggregate call whose references span two Data Marts', async () => {
      const { validator: v } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric('SUM({{ref field="clicks"}} * {{ref path="orders" field="amount"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'blended_metric',
          code: 'FORMULA_AGGREGATE_MIXES_OWNERS',
        }),
      ]);
    });

    // Spec §3.1, end to end through the real BigQuery dialect: the refusal is pinned at analyzer
    // level against a stubbed dialect, but not once through the path a save actually takes —
    // blendable schema, `resolveJoinedReference`, then the analyzer's own row-level check. The two
    // tests below are the two states `resolveJoinedReference` can hand back ('ok' and 'aggregate');
    // the refusal must survive both, which is what makes it independent of the state dispatch
    // rather than an arm of it.
    it('refuses a joined reference read at row level — the state that resolves cleanly', async () => {
      const { validator: v, dryRun } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric('CONCAT({{ref field="clicks"}}, {{ref path="orders" field="amount"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'blended_metric',
          code: 'FORMULA_JOINED_REFERENCE_ROW_LEVEL',
          subject: 'orders.amount',
        }),
      ]);
      expect(dryRun.execute).not.toHaveBeenCalled();
    });

    it('refuses a joined Unique Count read at row level, stacked on the restriction that already refuses it', async () => {
      const { validator: v } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric(`{{ref path="orders" field="${UNIQUE_COUNT_FIELD_TOKEN}"}} + 1`),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      // Both statements about the reference are true and both are reported. The slice-1 Unique
      // Count restriction is temporary; §3.1 is permanent, so it must not be the one that hides.
      // Asserted as a SET plus a count — which of the two is pushed first is push order, not the
      // property this test is about.
      expect(result.errors).toHaveLength(2);
      expect(result.errors.map(e => e.code)).toEqual(
        expect.arrayContaining([
          'FORMULA_JOINED_UNIQUE_COUNT_REFERENCE_NOT_SUPPORTED',
          'FORMULA_JOINED_REFERENCE_ROW_LEVEL',
        ])
      );
    });

    it('resolves a joined field against its own Data Mart, not a same-named calculated field of this one', async () => {
      const { validator: v } = buildValidator(
        blendable({
          sources: [{ aliasPath: 'orders' }],
          fields: [{ aliasPath: 'orders', originalFieldName: 'ctr' }],
        })
      );

      const result = await v.validate(
        schemaWith([
          { name: 'clicks', type: 'INTEGER' },
          {
            name: 'ctr',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
          },
          {
            name: 'combined',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref path="orders" field="ctr"}})', level: 'metric' },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([]);
    });

    it('resolves the join tree once for a save carrying several joined formulas', async () => {
      const { validator: v, blendableSchemaService } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        schemaWith([
          { name: 'clicks', type: 'INTEGER' },
          {
            name: 'a',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref path="orders" field="amount"}})', level: 'metric' },
          },
          {
            name: 'b',
            type: 'FLOAT',
            calculated: {
              formula: 'MAX({{ref path="orders" field="amount"}})',
              level: 'metric',
            },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([]);
      expect(blendableSchemaService.computeBlendableSchema).toHaveBeenCalledTimes(1);
    });

    it('never resolves a join tree for a formula that references only its own Data Mart', async () => {
      // Every formula saved before joined references existed carries path="" — those must keep
      // validating exactly as they did, without a join-tree lookup they never needed.
      const { validator: v, blendableSchemaService } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric('SUM({{ref field="clicks"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([]);
      expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
    });

    it('still resolves a joined path when the Data Mart has no warehouse to dry-run against', async () => {
      // A join tree lives in the Data Mart's relationships, not in its warehouse — a storage that
      // is not configured yet skips the dry run, and must not also skip this.
      const { validator: v } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric('SUM({{ref path="ghost" field="amount"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        undefined,
        joinTree
      );

      expect(result.errors).toEqual([
        expect.objectContaining({ code: 'FORMULA_JOINED_PATH_NOT_FOUND' }),
      ]);
    });

    it('refuses a joined reference it cannot check, rather than saving it unverified, when the save carries no identity to read the join tree with', async () => {
      // Saving it unchecked only moves the failure: the builder routes the path it was given, and
      // a stale one becomes a sleeve joined to a CTE that was never built — a broken REPORT RUN,
      // far from the save that caused it.
      const { validator: v, blendableSchemaService } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric('SUM({{ref path="orders" field="amount"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        { ...joinTree, accessor: { userId: '', roles: [] } }
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'blended_metric',
          code: 'FORMULA_JOINED_REFERENCE_UNVERIFIED',
        }),
      ]);
      expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
    });

    it('never reads the join tree for a joined reference that is commented out', async () => {
      // An analyst comments an old reference out instead of deleting it. `analyzeFormula` never
      // resolves a commented-out tag, so neither may this: reading relationships for one can fail
      // the save outright (a relationship pointing at a soft-deleted Data Mart throws), over a
      // reference the warehouse never even sees.
      const { validator: v, blendableSchemaService } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric('SUM({{ref field="clicks"}}) -- was {{ref path="orders" field="amount"}}'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([]);
      expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
    });

    it('reports a broken joined reference once, however many times the formula names it', async () => {
      const { validator: v } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric(
          'SUM({{ref path="orders" field="gone"}}) / NULLIF(MAX({{ref path="orders" field="gone"}}), 0)'
        ),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'blended_metric',
          code: 'FORMULA_JOINED_FIELD_NOT_AVAILABLE',
        }),
      ]);
    });

    // The dry run has to compose a joined formula the way a REPORT will, which means the
    // composer needs the saving user's own identity. A fabricated `{ userId: '' }` is not merely
    // useless there — `computeBlendableSchema` -> `canAccess` -> `getRoleScope('')` UPSERTS a
    // default role scope, i.e. it WRITES rows for a user that does not exist.
    it('hands the dry-run composer the saving user, and the join tree it already resolved', async () => {
      const { validator: v, composer, blendableSchemaService } = buildValidator(ordersWithAmount);

      const result = await v.validate(
        metric('SUM({{ref field="clicks"}}) * SUM({{ref path="orders" field="amount"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      expect(result.warehouseValidation).toBe('passed');
      expect(composer.composeMetricsOnly).toHaveBeenCalledTimes(1);
      const [, names, passedAccessor, passedSchema] = composer.composeMetricsOnly.mock.calls[0];
      expect(names).toEqual(['blended_metric']);
      expect(passedAccessor).toEqual(accessor);
      // The same object the parser pass validated against — one read per save, and no window in
      // which the two passes could see different join trees.
      expect(passedSchema).toBe(ordersWithAmount);
      expect(blendableSchemaService.computeBlendableSchema).toHaveBeenCalledTimes(1);
    });

    it('passes no join tree to the composer for a formula that reads only its own Data Mart', async () => {
      const { validator: v, composer } = buildValidator(ordersWithAmount);

      await v.validate(
        metric('SUM({{ref field="clicks"}})'),
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx(),
        joinTree
      );

      const [, , passedAccessor, passedSchema] = composer.composeMetricsOnly.mock.calls[0];
      expect(passedAccessor).toEqual(accessor);
      expect(passedSchema).toBeUndefined();
    });
  });

  // A formula may reference another Calculated Field of the SAME Data Mart. The level is
  // what this has to get right — the failure is a formula classified 'column' that then
  // becomes a GROUP BY key and collapses the report to one silently wrong row.
  describe('a formula referencing another calculated field', () => {
    const levelOf = (schema: DataMartSchema, name: string) =>
      (schema.fields.find(f => f.name === name) as unknown as { calculated: { level?: string } })
        .calculated.level;

    // THE headline formula. `revenue / cost` holds no aggregate call in its OWN text, so the level
    // is only knowable once both references have come back.
    it('accepts two bare aggregate-level references and calls the formula a metric', async () => {
      const schema = schemaWith([
        { name: 'amount', type: 'FLOAT' },
        { name: 'spend', type: 'FLOAT' },
        {
          name: 'revenue',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field="amount"}})' },
        },
        { name: 'cost', type: 'FLOAT', calculated: { formula: 'SUM({{ref field="spend"}})' } },
        {
          name: 'roas',
          type: 'FLOAT',
          calculated: { formula: '{{ref field="revenue"}} / NULLIF({{ref field="cost"}}, 0)' },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([]);
      expect(levelOf(schema, 'roas')).toBe('metric');
    });

    // MOVE 6, and the failure that is SILENT: the per-field loop rewrites each level only after it
    // finishes, so a `knownField` answering from `field.calculated.level` analyses `roas` against
    // `revenue`'s PREVIOUS level. `roas` is declared before `revenue` here on purpose — in schema
    // order, `revenue` has not been re-analysed yet. Wrong level, NO error, save clean, and the
    // report silently collapses to a grand total. Kills "read the persisted level".
    it('derives a level from the level its dependency gets in THIS save, not its previous one', async () => {
      const schema = schemaWith([
        { name: 'amount', type: 'FLOAT' },
        {
          name: 'roas',
          type: 'FLOAT',
          // Added in this very save, so it has no previous level of its own.
          calculated: { formula: '{{ref field="revenue"}} / 2' },
        },
        {
          name: 'revenue',
          type: 'FLOAT',
          // Edited in this save from a row-level formula to an aggregating one; the level still
          // carries the answer from before the edit.
          calculated: { formula: 'SUM({{ref field="amount"}})', level: 'column' },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([]);
      expect(levelOf(schema, 'revenue')).toBe('metric');
      expect(levelOf(schema, 'roas')).toBe('metric');
    });

    // The mirror: a row-level formula over another row-level one stays a DIMENSION, so the report
    // keeps grouping by it. Kills "any calculated reference makes the formula a metric".
    it('leaves a row-level formula row-level when the formula it reads is row-level too', async () => {
      const schema = schemaWith([
        { name: 'first', type: 'STRING' },
        { name: 'last', type: 'STRING' },
        {
          name: 'full_name',
          type: 'STRING',
          calculated: { formula: 'CONCAT({{ref field="first"}}, {{ref field="last"}})' },
        },
        {
          name: 'greeting',
          type: 'STRING',
          calculated: { formula: 'CONCAT(\'Hi \', {{ref field="full_name"}})' },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([]);
      expect(levelOf(schema, 'greeting')).toBe('column');
    });

    // Three hops, declared dependant-first, so nothing but the dependency ORDER can produce this.
    it('derives a whole chain in dependency order, however the schema lists it', async () => {
      const schema = schemaWith([
        {
          name: 'top',
          type: 'FLOAT',
          calculated: { formula: '{{ref field="middle"}} + 1' },
        },
        { name: 'middle', type: 'FLOAT', calculated: { formula: '{{ref field="base"}} * 2' } },
        { name: 'base', type: 'FLOAT', calculated: { formula: 'SUM({{ref field="amount"}})' } },
        { name: 'amount', type: 'FLOAT' },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([]);
      expect([levelOf(schema, 'base'), levelOf(schema, 'middle'), levelOf(schema, 'top')]).toEqual([
        'metric',
        'metric',
        'metric',
      ]);
    });

    // An aggregate-level calculated field IS an aggregate: wrapping it in another one is the same
    // error as aggregating a Unique Count, and the message must say "calculated field" so the
    // analyst knows the fix lives in ANOTHER formula.
    it('still refuses wrapping an aggregate-level calculated reference in an aggregate', async () => {
      const result = await validator.validate(
        schemaWith([
          { name: 'amount', type: 'FLOAT' },
          {
            name: 'revenue',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="amount"}})' },
          },
          {
            name: 'doubled',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="revenue"}})' },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'doubled',
          code: 'FORMULA_AGGREGATE_ON_AGGREGATE',
          subject: 'revenue',
          message: expect.stringContaining('calculated field'),
        }),
      ]);
    });

    // A NESTED calculated field is not a formula target at all: no plan can substitute one, and
    // the schema parser refuses that shape on every save path. It must not resolve here either.
    it('does not resolve a reference to a calculated field nested inside a RECORD', async () => {
      const schema = {
        type: 'bigquery-data-mart-schema',
        fields: [
          {
            name: 'parent',
            type: 'RECORD',
            status: DataMartSchemaFieldStatus.CONNECTED,
            fields: [
              {
                name: 'child',
                type: 'FLOAT',
                status: DataMartSchemaFieldStatus.CONNECTED,
                calculated: { formula: 'SUM({{ref field="amount"}})', level: 'metric' },
              },
            ],
          },
          {
            name: 'roas',
            type: 'FLOAT',
            status: DataMartSchemaFieldStatus.CONNECTED,
            calculated: { formula: '{{ref field="parent.child"}} / 2' },
          },
        ],
      } as unknown as DataMartSchema;

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'roas',
          code: 'FORMULA_UNKNOWN_REFERENCE',
          subject: 'parent.child',
        }),
      ]);
    });
  });

  // One walk over the whole schema, because no field can see a cycle from where it stands: `a` only
  // knows it reads `b`. Other violations still fire alongside the cycle — a self-reference is also
  // an aggregate wrapped in an aggregate — so each test asks about the cycle verdict alone.
  // (FORMULA_CALCULATED_REFERENCE is no longer among them: these are own-Data-Mart formulas, and
  // that refusal is lifted for them.)
  describe('cycles between formulas', () => {
    const cycleErrors = (errors: readonly FormulaViolation[]) =>
      errors.filter(e => e.code === 'FORMULA_CIRCULAR_REFERENCE');

    it('refuses a formula that references itself', async () => {
      const result = await validator.validate(
        schemaWith([
          { name: 'clicks', type: 'INTEGER' },
          {
            name: 'a',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="a"}})', level: 'metric' },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(cycleErrors(result.errors)).toEqual([
        expect.objectContaining({
          field: 'a',
          subject: 'a',
          message: expect.stringContaining('references itself'),
        }),
      ]);
    });

    it('refuses a two-field cycle, reporting it against both fields', async () => {
      const result = await validator.validate(
        schemaWith([
          {
            name: 'a',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="b"}})', level: 'metric' },
          },
          {
            name: 'b',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="a"}})', level: 'metric' },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      const cycle = cycleErrors(result.errors);
      // The subject is the reference inside THAT field's formula, so the editor marks the token the
      // analyst can actually delete — not the field the message happens to start the chain with.
      expect(cycle.map(e => [e.field, e.subject])).toEqual([
        ['a', 'b'],
        ['b', 'a'],
      ]);
      expect(cycle[0].message).toContain('`a` → `b` → `a`');
    });

    it('refuses a three-field cycle, naming every field on it', async () => {
      const result = await validator.validate(
        schemaWith([
          {
            name: 'a',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="b"}})', level: 'metric' },
          },
          {
            name: 'b',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="c"}})', level: 'metric' },
          },
          {
            name: 'c',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="a"}})', level: 'metric' },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(cycleErrors(result.errors).map(e => e.field)).toEqual(['a', 'b', 'c']);
      expect(cycleErrors(result.errors)[0].message).toContain('`a` → `b` → `c` → `a`');
    });

    // The mutation a visited set that never unwinds would fail: `b` and `c` both read `d`, which is
    // a diamond, not a loop.
    it('does not call a diamond a cycle', async () => {
      const result = await validator.validate(
        schemaWith([
          { name: 'clicks', type: 'INTEGER' },
          {
            name: 'd',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
          },
          {
            name: 'b',
            type: 'FLOAT',
            calculated: { formula: '{{ref field="d"}} + 1', level: 'metric' },
          },
          {
            name: 'c',
            type: 'FLOAT',
            calculated: { formula: '{{ref field="d"}} + 2', level: 'metric' },
          },
          {
            name: 'a',
            type: 'FLOAT',
            calculated: { formula: '{{ref field="b"}} + {{ref field="c"}}', level: 'metric' },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(cycleErrors(result.errors)).toEqual([]);
    });

    // A commented-out tag is not SQL, so it is not a dependency either — the same rule the owner
    // plan and the broken-reference check already follow.
    it('does not call a commented-out self-reference a cycle', async () => {
      const result = await validator.validate(
        schemaWith([
          { name: 'clicks', type: 'INTEGER' },
          {
            name: 'a',
            type: 'FLOAT',
            calculated: {
              formula: 'SUM({{ref field="clicks"}}) -- was {{ref field="a"}}',
              level: 'metric',
            },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(result.errors).toEqual([]);
    });

    // A joined Data Mart's field of the same name is a DIFFERENT field, and reading one is refused
    // on its own terms — calling it a cycle would name the wrong problem.
    it('does not call a joined reference to a same-named field a cycle', async () => {
      const result = await validator.validate(
        schemaWith([
          {
            name: 'a',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref path="orders" field="a"}})', level: 'metric' },
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(result.errors).toEqual([
        expect.objectContaining({ field: 'a', code: 'FORMULA_JOINED_REFERENCE_UNVERIFIED' }),
      ]);
    });

    it('reports a syntax error rather than throwing out of the cycle walk', async () => {
      const result = await validator.validate(
        schemaWith([
          { name: 'a', type: 'FLOAT', calculated: { formula: '{{date}}', level: 'metric' } },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(result.errors).toEqual([
        expect.objectContaining({ field: 'a', code: 'FORMULA_SYNTAX' }),
      ]);
    });
  });

  it('collects warnings across calculated fields the same way as errors', async () => {
    const result = await validator.validate(
      schemaWith([
        { name: 'a', type: 'INTEGER' },
        { name: 'b', type: 'INTEGER' },
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: {
            formula: 'SUM({{ref field="a"}}) / SUM({{ref field="b"}})',
            level: 'metric',
          },
        },
      ]),
      DataStorageType.GOOGLE_BIGQUERY
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ field: 'ctr', code: 'FORMULA_UNGUARDED_DIVISION' }),
    ]);
  });

  describe('warehouse dry run at save', () => {
    const buildValidator = () => {
      const composer = { composeMetricsOnly: jest.fn().mockResolvedValue({ sql: 'SELECT 1' }) };
      const dryRun = { execute: jest.fn() };
      const dryRunValidator = new CalculatedFieldValidatorService(
        createFormulaFunctionDialectRegistry(),
        composer as never,
        dryRun as never,
        noopBlendableSchema as never
      );
      return { validator: dryRunValidator, composer, dryRun };
    };

    const buildCtx = (storageType: DataStorageType = DataStorageType.GOOGLE_BIGQUERY) =>
      ({
        dataMart: { id: 'dm-1' },
        storageType,
        credentials: {},
        config: {},
      }) as unknown as DryRunContext;

    const oneMetricSchema = schemaWith([
      { name: 'clicks', type: 'INTEGER' },
      {
        name: 'a',
        type: 'FLOAT',
        calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
      },
    ]);

    const twoMetricsSchema = schemaWith([
      { name: 'clicks', type: 'INTEGER' },
      { name: 'impressions', type: 'INTEGER' },
      {
        name: 'a',
        type: 'FLOAT',
        calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
      },
      {
        name: 'b',
        type: 'FLOAT',
        calculated: { formula: 'SUM({{ref field="impressions"}})', level: 'metric' },
      },
    ]);

    const threeMetricsSchema = schemaWith([
      { name: 'clicks', type: 'INTEGER' },
      { name: 'impressions', type: 'INTEGER' },
      {
        name: 'a',
        type: 'FLOAT',
        calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
      },
      {
        name: 'b',
        type: 'FLOAT',
        calculated: { formula: 'SUM({{ref field="impressions"}})', level: 'metric' },
      },
      {
        name: 'c',
        type: 'FLOAT',
        calculated: {
          formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
          level: 'metric',
        },
      },
    ]);

    it('issues ONE dry run for a schema carrying several metrics', async () => {
      const { validator: v, dryRun } = buildValidator();
      dryRun.execute.mockResolvedValue(SqlDryRunResult.success());

      const result = await v.validate(
        threeMetricsSchema,
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx()
      );

      expect(dryRun.execute).toHaveBeenCalledTimes(1);
      expect(result.errors).toEqual([]);
      expect(result.warehouseValidation).toBe('passed');
    });

    it('localizes the failing metric with follow-up runs', async () => {
      const { validator: v, dryRun, composer } = buildValidator();
      dryRun.execute
        .mockResolvedValueOnce(SqlDryRunResult.failed('Unrecognized name: clcks')) // combined
        .mockResolvedValueOnce(SqlDryRunResult.success()) // metric a alone
        .mockResolvedValueOnce(SqlDryRunResult.failed('Unrecognized name: clcks')); // metric b alone

      const result = await v.validate(
        twoMetricsSchema,
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx()
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'b',
          code: 'FORMULA_WAREHOUSE_REJECTED',
          message: expect.stringContaining('Unrecognized name: clcks'),
        }),
      ]);
      expect(dryRun.execute).toHaveBeenCalledTimes(3);
      // The verdict above is attributed purely by CALL ORDER against the mock, so without this
      // the attribution is pinned by the mock's own sequencing rather than by the implementation:
      // a version that dry-ran the metrics in the wrong order, or composed the same metric twice,
      // would blame the innocent field and still pass. Assert WHICH metric each run carried.
      expect(composer.composeMetricsOnly.mock.calls.map(call => call[1])).toEqual([
        ['a', 'b'],
        ['a'],
        ['b'],
      ]);
      // The dataMart passed in must be the one carrying the schema being validated (the
      // composer's own documented precondition) — never a second, unrelated instance.
      expect(composer.composeMetricsOnly.mock.calls.map(call => call[0].id)).toEqual([
        'dm-1',
        'dm-1',
        'dm-1',
      ]);
      // All three compositions share ONE table-reference memo. Composing the blended path resolves
      // each involved Data Mart's table reference, and for a SQL-defined one that is a
      // CREATE OR REPLACE VIEW against the customer's warehouse — so a per-composition memo would
      // mean N+1 warehouse writes per save rather than one per Data Mart.
      const memos = composer.composeMetricsOnly.mock.calls.map(call => call[4]);
      expect(memos[0]).toBeInstanceOf(Map);
      expect(memos[1]).toBe(memos[0]);
      expect(memos[2]).toBe(memos[0]);
    });

    it('saves with a skipped stamp when the warehouse is unreachable', async () => {
      const { validator: v, dryRun } = buildValidator();
      dryRun.execute.mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await v.validate(oneMetricSchema, DataStorageType.GOOGLE_BIGQUERY, buildCtx());

      expect(result.errors).toEqual([]);
      expect(result.warnings[0].code).toBe('FORMULA_WAREHOUSE_CHECK_SKIPPED');
      expect(result.warehouseValidation).toBe('skipped');
    });

    // Composing the blended path is no longer pure computation: resolving a SQL-defined joined Data
    // Mart's table reference runs CREATE OR REPLACE VIEW against the customer's warehouse. That
    // happens BEFORE the dry run, so without a guard an expired token or a brief outage escaped
    // the save entirely — never reaching the transient handling that only wraps the dry run.
    it('saves with a skipped stamp when COMPOSING the dry-run query hits the warehouse and fails', async () => {
      const { validator: v, composer, dryRun } = buildValidator();
      composer.composeMetricsOnly.mockRejectedValue(new Error('ETIMEDOUT refreshing view'));

      const result = await v.validate(oneMetricSchema, DataStorageType.GOOGLE_BIGQUERY, buildCtx());

      expect(result.errors).toEqual([]);
      expect(result.warnings[0].code).toBe('FORMULA_WAREHOUSE_CHECK_SKIPPED');
      expect(result.warehouseValidation).toBe('skipped');
      expect(dryRun.execute).not.toHaveBeenCalled();
    });

    // The other half, and the reason the guard is narrow rather than a blanket catch: a
    // composition REFUSAL is a verdict on the formula. Laundering one into 'skipped' would persist
    // a stamp saying "not checked yet" for a formula we already know cannot be composed.
    it('does NOT convert a composition refusal into a skipped stamp', async () => {
      const { validator: v, composer, dryRun } = buildValidator();
      const refusal = new BusinessViolationException(
        "The calculated field 'a' reads 'orders.amount' from a joined Data Mart"
      );
      composer.composeMetricsOnly.mockRejectedValue(refusal);

      await expect(
        v.validate(oneMetricSchema, DataStorageType.GOOGLE_BIGQUERY, buildCtx())
      ).rejects.toBe(refusal);
      // Refused once, not retried per metric behind the analyst's back.
      expect(composer.composeMetricsOnly).toHaveBeenCalledTimes(1);
      expect(dryRun.execute).not.toHaveBeenCalled();
    });

    // Same reason, for the other refusal shape: output-controls validation and the composer's own
    // capability guard reject with a Nest HttpException.
    it('does NOT convert an output-controls rejection into a skipped stamp', async () => {
      const { validator: v, composer } = buildValidator();
      const rejection = new BadRequestException({
        message: 'Output controls validation failed',
        details: { errors: [{ code: 'CALCULATED_FIELD_BROKEN_REFERENCES', column: 'a' }] },
      });
      composer.composeMetricsOnly.mockRejectedValue(rejection);

      await expect(
        v.validate(oneMetricSchema, DataStorageType.GOOGLE_BIGQUERY, buildCtx())
      ).rejects.toBe(rejection);
    });

    it('treats a Databricks isValid:false as a rejection, not a success', async () => {
      // The Databricks adapter swallows the error and returns {isValid:false} instead of
      // throwing (databricks-api.adapter.ts, executeDryRunQuery) — every layer above it must key
      // off `isValid`, never off a caught exception, or this comes back as a silent "passed".
      const { validator: v, dryRun } = buildValidator();
      dryRun.execute.mockResolvedValue(new SqlDryRunResult(false, 'PARSE_SYNTAX_ERROR'));

      const result = await v.validate(
        oneMetricSchema,
        DataStorageType.DATABRICKS,
        buildCtx(DataStorageType.DATABRICKS)
      );

      expect(result.errors).toEqual([
        expect.objectContaining({ field: 'a', code: 'FORMULA_WAREHOUSE_REJECTED' }),
      ]);
    });

    it('reports against the whole set when the combined run fails but no single metric fails in isolation', async () => {
      // Two formulas that only conflict TOGETHER (e.g. an ambiguous column the combined SELECT
      // introduces): localization finds nobody to blame, so the whole set is rejected rather than
      // letting an unattributable failure through.
      const { validator: v, dryRun, composer } = buildValidator();
      dryRun.execute
        .mockResolvedValueOnce(SqlDryRunResult.failed('Ambiguous column reference')) // combined
        .mockResolvedValueOnce(SqlDryRunResult.success()) // metric a alone
        .mockResolvedValueOnce(SqlDryRunResult.success()); // metric b alone

      const result = await v.validate(
        twoMetricsSchema,
        DataStorageType.GOOGLE_BIGQUERY,
        buildCtx()
      );

      expect(result.errors).toEqual([
        expect.objectContaining({
          field: 'a',
          code: 'FORMULA_WAREHOUSE_REJECTED',
          message: expect.stringContaining('Ambiguous column reference'),
        }),
      ]);
      // The CODE and the warehouse text are identical for both violations, so asserting those
      // alone let `warehouseRejectedAsSet` be swapped for `warehouseRejected` unnoticed — and the
      // whole point of the second one is that it must NOT read as "field `a`'s own formula is
      // broken", which is exactly the wrong thing to tell an analyst whose formula passed on its
      // own. Pin the distinguishing sentence, in both directions.
      expect(result.errors[0].message).toContain('could not be validated together');
      expect(result.errors[0].message).toContain('Each formula passed individually');
      expect(result.errors[0].message).not.toContain('The warehouse rejected this formula');
      expect(dryRun.execute).toHaveBeenCalledTimes(3);
      expect(composer.composeMetricsOnly.mock.calls.map(call => call[1])).toEqual([
        ['a', 'b'],
        ['a'],
        ['b'],
      ]);
    });

    it('never dry-runs when the parser pass itself already found a violation', async () => {
      const { validator: v, dryRun } = buildValidator();
      const badSchema = schemaWith([
        {
          name: 'bad',
          type: 'FLOAT',
          calculated: { formula: '{{ref field="missing"}}', level: 'metric' },
        },
      ]);

      const result = await v.validate(badSchema, DataStorageType.GOOGLE_BIGQUERY, buildCtx());

      expect(dryRun.execute).not.toHaveBeenCalled();
      expect(result.errors).toEqual([
        expect.objectContaining({ field: 'bad', code: 'FORMULA_UNKNOWN_REFERENCE' }),
      ]);
      expect(result.warehouseValidation).toBeUndefined();
    });

    it('skips the warehouse phase entirely when no dry-run context is supplied', async () => {
      const { validator: v, dryRun } = buildValidator();

      const result = await v.validate(oneMetricSchema, DataStorageType.GOOGLE_BIGQUERY);

      expect(dryRun.execute).not.toHaveBeenCalled();
      expect(result).toEqual({ errors: [], warnings: [] });
    });

    it('still dry-runs when every calculated formula is byte-identical to the last save — no unchanged-formula skip in this slice', async () => {
      // A persisted per-field `calculated.warehouseValidation` marker DOES exist (a schema
      // field, populated by UpdateDataMartSchemaService after this validator returns) — so an
      // unchanged-formula skip is no longer blocked on "there's nothing to key it off". It is
      // still deliberately NOT built here: one dry run per save is an accepted cost, and adding
      // the skip is out of this task's scope by explicit decision, not by necessity.
      const { validator: v, dryRun, composer } = buildValidator();
      dryRun.execute.mockResolvedValue(SqlDryRunResult.success());
      const ctx = buildCtx();
      (ctx.dataMart as unknown as { schema: DataMartSchema }).schema = oneMetricSchema;

      await v.validate(oneMetricSchema, DataStorageType.GOOGLE_BIGQUERY, ctx);

      expect(dryRun.execute).toHaveBeenCalledTimes(1);
      expect(composer.composeMetricsOnly).toHaveBeenCalledTimes(1);
    });

    describe('transient (transport/availability) failures never block the save (Critical 2)', () => {
      it('treats a network-shaped isValid:false combined result as unreachable, not a rejection', async () => {
        // Every executor (BigQuery, Snowflake, Redshift, Athena, Databricks) catches its OWN
        // network exception and RESOLVES `isValid:false` instead of throwing — so a genuine
        // ECONNRESET never reaches this method's own try/catch as a rejected promise. It must
        // still be recognised here, from the error text, or a warehouse blip would block the save.
        const { validator: v, dryRun } = buildValidator();
        dryRun.execute.mockResolvedValue(SqlDryRunResult.failed('read ECONNRESET'));

        const result = await v.validate(
          oneMetricSchema,
          DataStorageType.GOOGLE_BIGQUERY,
          buildCtx()
        );

        expect(result.errors).toEqual([]);
        expect(result.warnings[0].code).toBe('FORMULA_WAREHOUSE_CHECK_SKIPPED');
        expect(result.warehouseValidation).toBe('skipped');
      });

      it('still blocks on a genuine SQL rejection whose text does not look transient', async () => {
        // The companion case to the test above: a real dialect error must NOT be swept into the
        // same leniency just because it also resolves as `isValid:false`.
        const { validator: v, dryRun } = buildValidator();
        dryRun.execute.mockResolvedValue(SqlDryRunResult.failed('Unrecognized name: clcks'));

        const result = await v.validate(
          oneMetricSchema,
          DataStorageType.GOOGLE_BIGQUERY,
          buildCtx()
        );

        expect(result.errors).toEqual([
          expect.objectContaining({ field: 'a', code: 'FORMULA_WAREHOUSE_REJECTED' }),
        ]);
        expect(result.warehouseValidation).toBeUndefined();
      });

      it('does not blame a field whose isolated localization run itself failed transiently, while a genuinely broken sibling still blocks', async () => {
        const { validator: v, dryRun, composer } = buildValidator();
        dryRun.execute
          .mockResolvedValueOnce(SqlDryRunResult.failed('Ambiguous column reference')) // combined
          .mockResolvedValueOnce(SqlDryRunResult.failed('connection timed out')) // metric a alone — transient
          .mockResolvedValueOnce(SqlDryRunResult.failed('Unrecognized name: clcks')); // metric b alone — genuine

        const result = await v.validate(
          twoMetricsSchema,
          DataStorageType.GOOGLE_BIGQUERY,
          buildCtx()
        );

        expect(result.errors).toEqual([
          expect.objectContaining({
            field: 'b',
            code: 'FORMULA_WAREHOUSE_REJECTED',
            message: expect.stringContaining('Unrecognized name: clcks'),
          }),
        ]);
        // Which run was transient and which was genuine is decided by call order alone unless
        // the per-call metric is asserted — the whole point of the test is that `a` was spared
        // and `b` blamed, so the calls have to be the ones that claim.
        expect(composer.composeMetricsOnly.mock.calls.map(call => call[1])).toEqual([
          ['a', 'b'],
          ['a'],
          ['b'],
        ]);
      });

      // The heuristic reads the warehouse's error TEXT, and a warehouse quotes the offending SQL
      // back — including source offsets. A bare three-digit match therefore classified a genuine
      // SQL rejection as a network blip and saved the broken formula stamped `skipped`, which is
      // the one outcome this heuristic must never produce.
      it.each([
        ['a source offset that looks like a 5xx', 'Unrecognized name: clcks at [1:503]'],
        ["a 401 inside the analyst's own formula text", 'Syntax error near "SUM(cost_401)"'],
        ['a plain number in the message', 'Query exceeded limit of 500 columns'],
      ])('still blocks a genuine SQL rejection carrying %s', async (_case, error) => {
        const { validator: v, dryRun } = buildValidator();
        dryRun.execute.mockResolvedValue(SqlDryRunResult.failed(error));

        const result = await v.validate(
          oneMetricSchema,
          DataStorageType.GOOGLE_BIGQUERY,
          buildCtx()
        );

        expect(result.errors).toEqual([
          expect.objectContaining({ field: 'a', code: 'FORMULA_WAREHOUSE_REJECTED' }),
        ]);
        expect(result.warehouseValidation).toBeUndefined();
      });

      // …while a status code in genuine status-like context is still read as transient.
      it.each([
        ['HTTP 503 Service Unavailable', 'Request failed with HTTP 503'],
        ['a status-code phrasing', 'statusCode: 500 returned by the endpoint'],
        ['a 401 in status context', 'status 401 from the token endpoint'],
      ])('still treats %s as unreachable', async (_case, error) => {
        const { validator: v, dryRun } = buildValidator();
        dryRun.execute.mockResolvedValue(SqlDryRunResult.failed(error));

        const result = await v.validate(
          oneMetricSchema,
          DataStorageType.GOOGLE_BIGQUERY,
          buildCtx()
        );

        expect(result.errors).toEqual([]);
        expect(result.warehouseValidation).toBe('skipped');
      });

      // The same failure one level deeper than the numeric case above: the words the transient
      // clauses look for are ORDINARY ENGLISH, and the analyst controls part of the text being
      // searched, because the warehouse quotes the offending SQL back. A column named `dns` or
      // `timeout`, or the literal 'unauthorized', made every one of these read as a network blip.
      // Anchoring each clause cannot fix it; a SQL-rejection marker vetoing the whole verdict can.
      it.each([
        ['a column named dns', 'Unrecognized name: dns at [1:42]'],
        ['a column named timeout', 'Unrecognized name: timeout at [1:17]'],
        [
          "the word unauthorized in the analyst's literal",
          `Syntax error: Unexpected string literal 'unauthorized' at [1:9]`,
        ],
        [
          'a Trino column-not-found naming a network word',
          "COLUMN_NOT_FOUND: line 1:8: Column 'network error' cannot be resolved",
        ],
        [
          'a Snowflake compilation error quoting a token column',
          `SQL compilation error: invalid identifier 'TOKEN_EXPIRED'`,
        ],
        [
          'a Redshift rejection naming a service column',
          'ERROR: column "service unavailable" does not exist',
        ],
      ])('still blocks a genuine SQL rejection carrying %s', async (_case, error) => {
        const { validator: v, dryRun } = buildValidator();
        dryRun.execute.mockResolvedValue(SqlDryRunResult.failed(error));

        const result = await v.validate(
          oneMetricSchema,
          DataStorageType.GOOGLE_BIGQUERY,
          buildCtx()
        );

        expect(result.errors).toEqual([
          expect.objectContaining({ field: 'a', code: 'FORMULA_WAREHOUSE_REJECTED' }),
        ]);
        expect(result.warehouseValidation).toBeUndefined();
      });

      // One level past the veto: the analyst plants the transport wording as a VALUE, so the
      // warehouse echoes it back in a message that carries no rejection marker at all.
      // `CAST('timed out' AS INT64)` is refused by BigQuery with `Bad int64 value: timed out`.
      // Read whole, that matches `timed? ?out` and the save is stamped 'skipped' — switching the
      // warehouse check off for every OTHER calculated field in the same save. The heuristic now
      // reads only what the warehouse said on its own account.
      it('still blocks a rejection whose transport wording came from the formula itself', async () => {
        const { validator: v, dryRun } = buildValidator();
        dryRun.execute.mockResolvedValue(SqlDryRunResult.failed('Bad int64 value: timed out'));
        const schema = schemaWith([
          { name: 'x', type: 'INTEGER' },
          {
            name: 'a',
            type: 'INTEGER',
            calculated: { formula: `CAST('timed out' AS INT64)`, level: 'metric' },
          },
        ]);

        const result = await v.validate(schema, DataStorageType.GOOGLE_BIGQUERY, buildCtx());

        expect(result.errors).toEqual([
          expect.objectContaining({ field: 'a', code: 'FORMULA_WAREHOUSE_REJECTED' }),
        ]);
        expect(result.warehouseValidation).toBeUndefined();
      });

      // The veto must not swallow a real outage: these carry no SQL-rejection marker at all.
      it.each([
        ['a reset connection', 'ECONNRESET while contacting the endpoint'],
        ['a DNS failure', 'getaddrinfo EAI_AGAIN warehouse.example.com'],
        ['a plain timeout', 'connection timed out'],
      ])('still treats %s as unreachable', async (_case, error) => {
        const { validator: v, dryRun } = buildValidator();
        dryRun.execute.mockResolvedValue(SqlDryRunResult.failed(error));

        const result = await v.validate(
          oneMetricSchema,
          DataStorageType.GOOGLE_BIGQUERY,
          buildCtx()
        );

        expect(result.errors).toEqual([]);
        expect(result.warehouseValidation).toBe('skipped');
      });
    });
  });

  describe('canonicalizing the stored formula', () => {
    // The web reader (apps/web's formula-authoring.ts) only ever reads the ONE spelling this
    // canonicalization guarantees — `ref` first, `path` before `field`, one space, no unknown
    // keys — so it can stay a strict, simple pattern instead of chasing parity with the
    // Handlebars grammar `parseFormulaReferences` actually accepts here.
    it('rewrites non-canonical spacing and an unknown extra key into canonical form', async () => {
      const schema = schemaWith([
        { name: 'x', type: 'INTEGER' },
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field = "x"  bogus="y"}})', level: 'metric' },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([]);
      const ctr = schema.fields.find(f => f.name === 'ctr') as unknown as {
        calculated: { formula: string };
      };
      expect(ctr.calculated.formula).toBe('SUM({{ref field="x"}})');
    });

    // The second lock behind the scanner fix: whatever a client sends, the text that PERSISTS
    // carries only `\n`, so a stored formula can never hold a terminator the lexer and the
    // warehouse would read differently. Both CRLF and a lone CR collapse.
    it('collapses CRLF and a lone carriage return in the stored formula', async () => {
      const schema = schemaWith([
        { name: 'x', type: 'INTEGER' },
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field="x"}})\r\n-- note\r + 1', level: 'metric' },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([]);
      const ctr = schema.fields.find(f => f.name === 'ctr') as unknown as {
        calculated: { formula: string };
      };
      expect(ctr.calculated.formula).toBe('SUM({{ref field="x"}})\n-- note\n + 1');
      expect(ctr.calculated.formula).not.toContain('\r');
    });

    it('leaves an already-canonical formula byte-unchanged', async () => {
      const schema = schemaWith([
        { name: 'x', type: 'INTEGER' },
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field="x"}}) / 2', level: 'metric' },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([]);
      const ctr = schema.fields.find(f => f.name === 'ctr') as unknown as {
        calculated: { formula: string };
      };
      expect(ctr.calculated.formula).toBe('SUM({{ref field="x"}}) / 2');
    });

    it('does not touch the formula when the parser pass finds an error', async () => {
      const schema = schemaWith([
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field = "gone"}})', level: 'metric' },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors.length).toBeGreaterThan(0);
      const ctr = schema.fields.find(f => f.name === 'ctr') as unknown as {
        calculated: { formula: string };
      };
      expect(ctr.calculated.formula).toBe('SUM({{ref field = "gone"}})');
    });

    // serializeFormulaReference throws for a value containing a `"` — reachable even though every
    // field's own parser pass already succeeded, because Handlebars accepts a single-quoted or
    // backslash-escaped `"` inside a hash value. Both must turn into an ordinary FORMULA_SYNTAX
    // violation, never an unhandled exception out of validate().
    it('reports a syntax violation instead of throwing when a live reference resolves to a field name carrying a double quote', async () => {
      const schema = schemaWith([
        { name: 'a"b', type: 'INTEGER' },
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: { formula: `SUM({{ref field='a"b'}})`, level: 'metric' },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);
      expect(result.errors).toEqual([
        expect.objectContaining({ field: 'ctr', code: 'FORMULA_SYNTAX' }),
      ]);
      const ctr = schema.fields.find(f => f.name === 'ctr') as unknown as {
        calculated: { formula: string };
      };
      // Canonicalization threw before assigning — the original text survives unchanged.
      expect(ctr.calculated.formula).toBe(`SUM({{ref field='a"b'}})`);
    });

    it('reports a syntax violation instead of throwing when a tag inside a SQL comment carries a double quote', async () => {
      // The comment holds a reference the analyzer never inspects (it only checks LIVE
      // references), so the per-field parser pass finds nothing wrong — but renderFormula walks
      // the entire stored string, Handlebars tags and all, with no notion of a SQL comment.
      const schema = schemaWith([
        { name: 'clicks', type: 'INTEGER' },
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: {
            formula: `SUM({{ref field="clicks"}}) -- {{ref field='a"b'}}`,
            level: 'metric',
          },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([
        expect.objectContaining({ field: 'ctr', code: 'FORMULA_SYNTAX' }),
      ]);
      const ctr = schema.fields.find(f => f.name === 'ctr') as unknown as {
        calculated: { formula: string };
      };
      expect(ctr.calculated.formula).toBe(`SUM({{ref field="clicks"}}) -- {{ref field='a"b'}}`);
    });

    // The same seat, the other value it cannot represent. Handlebars reads `field='a\'` as the
    // column `a\`, so the analyzer's pass finds nothing wrong — but canonicalization re-emits it
    // double-quoted, where the trailing backslash runs into the closing quote and swallows the
    // rest of the formula. Nothing between here and the database would have rejected that string:
    // the corrupted formula is what gets saved, and every later read of it fails to parse.
    it('reports a syntax violation instead of persisting a formula whose field name ends in a backslash', async () => {
      const schema = schemaWith([
        { name: 'a\\', type: 'INTEGER' },
        { name: 'b', type: 'INTEGER' },
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: {
            formula: `SUM({{ref field='a\\'}}) / SUM({{ref field="b"}})`,
            level: 'metric',
          },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      // Refused EARLIER than it used to be, and for a better reason: the backslash now trips the
      // dialect-escape guard during analysis, so canonicalization — where this corruption used to
      // be caught, one step later — is never reached. What the test is really about is unchanged
      // and asserted below: the mangled formula must not be persisted.
      expect(result.errors.map(e => e.code)).toContain(
        'FORMULA_DIALECT_AMBIGUOUS_ESCAPE_NOT_ALLOWED'
      );
      expect(result.errors.every(e => e.field === 'ctr')).toBe(true);
      const ctr = schema.fields.find(f => f.name === 'ctr') as unknown as {
        calculated: { formula: string };
      };
      expect(ctr.calculated.formula).toBe(`SUM({{ref field='a\\'}}) / SUM({{ref field="b"}})`);
    });
  });

  describe("writing the formula's derived level", () => {
    const levelOf = (schema: DataMartSchema, name: string) =>
      (schema.fields.find(f => f.name === name) as unknown as { calculated: { level?: string } })
        .calculated.level;

    const rowLevel = (level?: CalculatedFieldLevel) =>
      schemaWith([
        { name: 'session_id', type: 'STRING' },
        { name: 'user_id', type: 'STRING' },
        {
          name: 'session_key',
          type: 'STRING',
          calculated: {
            formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
            level,
          },
        },
      ]);

    const aggregate = (level?: CalculatedFieldLevel) =>
      schemaWith([
        { name: 'clicks', type: 'INTEGER' },
        {
          name: 'total_clicks',
          type: 'INTEGER',
          calculated: { formula: 'SUM({{ref field="clicks"}})', level },
        },
      ]);

    it('writes the level derived from the formula, ignoring what the client sent', async () => {
      const schema = rowLevel('metric');

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([]);
      expect(levelOf(schema, 'session_key')).toBe('column');
    });

    it("overwrites a client's row-level claim about a formula that aggregates", async () => {
      const schema = aggregate('column');

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([]);
      expect(levelOf(schema, 'total_clicks')).toBe('metric');
    });

    // The pair above only proves the client's value is CORRECTED. These prove it is never
    // CONSULTED: a write that flipped whatever arrived would satisfy both of them and fail here.
    it('derives the level rather than trusting a client that happened to send the right one', async () => {
      const row = rowLevel('column');
      const agg = aggregate('metric');

      expect((await validator.validate(row, DataStorageType.GOOGLE_BIGQUERY)).errors).toEqual([]);
      expect((await validator.validate(agg, DataStorageType.GOOGLE_BIGQUERY)).errors).toEqual([]);

      expect(levelOf(row, 'session_key')).toBe('column');
      expect(levelOf(agg, 'total_clicks')).toBe('metric');
    });

    it('derives the level for a client that sent none at all — the shape the web now submits', async () => {
      const schema = rowLevel();

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([]);
      expect(levelOf(schema, 'session_key')).toBe('column');
    });

    // `analyzeFormula`'s Handlebars-syntax early return reports 'column' for a formula it never
    // read, deliberately — so that "metric iff an aggregate call was found" holds on every path.
    // Persisting THAT would turn an unparseable formula into a row-level field, which a later
    // slice puts in a GROUP BY. The write is gated on `errors.length === 0` for exactly this.
    it('writes no level at all when the analysis carried errors', async () => {
      const schema = schemaWith([
        {
          name: 'broken',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{date}})', level: 'metric' },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([
        expect.objectContaining({ field: 'broken', code: 'FORMULA_SYNTAX' }),
      ]);
      expect(levelOf(schema, 'broken')).toBe('metric');
    });

    it('leaves the level untouched when only ANOTHER field in the same save is broken', async () => {
      const schema = schemaWith([
        { name: 'session_id', type: 'STRING' },
        { name: 'user_id', type: 'STRING' },
        {
          name: 'session_key',
          type: 'STRING',
          calculated: {
            formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
            level: 'metric',
          },
        },
        {
          name: 'broken',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field="gone"}})', level: 'metric' },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(levelOf(schema, 'session_key')).toBe('metric');
    });

    // The level and the canonical formula are two halves of one rewrite, so they move together.
    // This formula's parser pass is clean and it is row-level, but canonicalization throws on the
    // `"` inside the field name — leaving the field described by a level derived for text that was
    // never accepted. Unpersistable (the pushed error refuses the save), so this pins an in-memory
    // invariant rather than a user-visible bug; it fails if the write moves ahead of the rewrite.
    it('writes neither the level nor the canonical formula when canonicalization throws', async () => {
      const schema = schemaWith([
        { name: 'a"b', type: 'STRING' },
        {
          name: 'echo',
          type: 'STRING',
          calculated: { formula: `{{ref field='a"b'}}`, level: 'metric' },
        },
      ]);

      const result = await validator.validate(schema, DataStorageType.GOOGLE_BIGQUERY);

      expect(result.errors).toEqual([
        expect.objectContaining({ field: 'echo', code: 'FORMULA_SYNTAX' }),
      ]);
      expect(levelOf(schema, 'echo')).toBe('metric');
    });
  });

  // The seam, with the REAL composer rather than a stub: saving a metric that reads a joined Data
  // Mart must dry-run the query a report will actually build. Composed flat, the reference renders
  // as `main."amount"` — and the main Data Mart below deliberately OWNS a column called `amount`,
  // so that query is valid SQL over the wrong column. A warehouse cannot tell the difference, so a
  // green dry run would stamp `warehouseValidation: 'passed'` — a claim that the warehouse
  // accepted THIS query when it accepted a different one, and the stamp that decides whether the
  // next save re-checks at all.
  describe('the save-time dry run of a joined formula', () => {
    const JOINED_FORMULA =
      'SUM({{ref field="clicks"}}) * SUM({{ref path="orders" field="amount"}})';

    const blendable = {
      nativeFields: [],
      blendedFields: [
        {
          aliasPath: 'orders',
          originalFieldName: 'amount',
          name: 'orders__amount',
          type: 'FLOAT',
          isHidden: false,
        },
      ],
      availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      calculatedFieldIssues: [],
    };

    const collidingSchema = () =>
      schemaWith([
        { name: 'clicks', type: 'INTEGER' },
        // The collision: main owns `amount` too.
        { name: 'amount', type: 'FLOAT' },
        {
          name: 'revenue_per_click',
          type: 'FLOAT',
          calculated: { formula: JOINED_FORMULA, level: 'metric' },
        },
      ]);

    const buildValidator = (decision: object) => {
      const realBuilder = new BigQueryQueryBuilder(new BigQueryClauseRenderer());
      const composer = new ReportSqlComposerService(
        { resolveBlendingDecision: jest.fn().mockResolvedValue(decision) } as never,
        {
          buildQuery: (
            _type: unknown,
            definition: Parameters<BigQueryQueryBuilder['buildQuery']>[0],
            options: Parameters<BigQueryQueryBuilder['buildQuery']>[1]
          ) => realBuilder.buildQuery(definition, options),
        } as never,
        { resolveTableName: jest.fn().mockResolvedValue('`proj`.`ds`.`view_x`') } as never,
        { isSupported: jest.fn().mockReturnValue(true) } as never,
        { computeBlendableSchema: jest.fn() } as never,
        { validateForReport: jest.fn() } as never
      );
      const dryRun = { execute: jest.fn().mockResolvedValue(SqlDryRunResult.success()) };
      return {
        validator: new CalculatedFieldValidatorService(
          createFormulaFunctionDialectRegistry(),
          composer as never,
          dryRun as never,
          { computeBlendableSchema: jest.fn().mockResolvedValue(blendable) } as never
        ),
        dryRun,
      };
    };

    const accessor = { userId: 'user-1', roles: ['editor'] };
    const joinTree = { dataMartId: 'dm-1', projectId: 'project-1', accessor };
    const ctx = (schema: DataMartSchema) =>
      ({
        dataMart: {
          id: 'dm-1',
          projectId: 'project-1',
          storage: { type: DataStorageType.GOOGLE_BIGQUERY },
          definition: { type: 'table', fullyQualifiedName: 'proj.ds.tbl' },
          schema,
        },
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        credentials: {},
        config: {},
      }) as unknown as DryRunContext;

    it('dry-runs the BLENDED query and stamps it passed', async () => {
      const { validator: v, dryRun } = buildValidator({
        needsBlending: true,
        blendedSql: 'SELECT blended_rpc FROM orders_cte',
      });
      const schema = collidingSchema();

      const result = await v.validate(
        schema,
        DataStorageType.GOOGLE_BIGQUERY,
        ctx(schema),
        joinTree
      );

      expect(result.errors).toEqual([]);
      expect(result.warehouseValidation).toBe('passed');
      // One dry run per save, and the SQL is the blended one — not `main.\`amount\``.
      expect(dryRun.execute).toHaveBeenCalledTimes(1);
      const submitted = dryRun.execute.mock.calls[0][3] as string;
      expect(submitted).toBe('SELECT blended_rpc FROM orders_cte');
      expect(submitted).not.toContain('`amount`');
    });

    it('never stamps passed off a query that read main.amount instead of orders.amount', async () => {
      // Force the flat decision — the state that used to be hardcoded here. The composition must
      // fail rather than produce the valid-but-wrong `main.\`amount\`` query.
      const { validator: v, dryRun } = buildValidator({
        needsBlending: false,
        columnFilter: ['revenue_per_click'],
      });
      const schema = collidingSchema();

      await expect(
        v.validate(schema, DataStorageType.GOOGLE_BIGQUERY, ctx(schema), joinTree)
      ).rejects.toThrow(/orders\.amount/);
      expect(dryRun.execute).not.toHaveBeenCalled();
    });
  });

  // The save-time dry run batched EVERY calculated field into one composed query, so a single
  // sibling carrying a joined reference sent the whole batch down the blended path — where the
  // then-current guard refused the row-level field that was only ever along for the ride. That
  // guard is gone, so the split now buys a smaller query rather than a save that works at all;
  // its own justification survives either way, so it is left as it is.
  describe('a row-level formula saved beside an aggregate one that reads a joined Data Mart', () => {
    const JOINED_AGGREGATE =
      'SUM({{ref path="orders" field="amount"}}) * AVG({{ref field="cost"}})';
    const ROW_LEVEL = `IF({{ref field="cost"}} > 5, 'asd', 'bsd')`;
    const BLENDED_SQL = 'SELECT joined_orders_amount FROM orders_cte';

    const blendable = {
      nativeFields: [],
      blendedFields: [
        {
          aliasPath: 'orders',
          originalFieldName: 'amount',
          name: 'orders__amount',
          type: 'FLOAT',
          isHidden: false,
        },
      ],
      availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      calculatedFieldIssues: [],
    };

    // No `level` on either field: it is derived from the formula, which is the shape the web
    // submits and the shape the reported save carried.
    const reportedSchema = () =>
      schemaWith([
        { name: 'cost', type: 'FLOAT' },
        {
          name: 'joined_orders_amount',
          type: 'FLOAT',
          calculated: { formula: JOINED_AGGREGATE },
        },
        { name: 'str_field_not_agg', type: 'STRING', calculated: { formula: ROW_LEVEL } },
      ]);

    const localMixedSchema = () =>
      schemaWith([
        { name: 'cost', type: 'FLOAT' },
        { name: 'total_cost', type: 'FLOAT', calculated: { formula: 'SUM({{ref field="cost"}})' } },
        { name: 'str_field_not_agg', type: 'STRING', calculated: { formula: ROW_LEVEL } },
      ]);

    type MetricsOnlyPlan = { dataMart: { schema: DataMartSchema }; columnConfig: string[] };

    const buildValidator = () => {
      // Stands in for `BlendedReportDataService.resolveBlendingDecision`, which the composer
      // consults only once a plan is routed blended. It used to reproduce that path's refusal of a
      // row-level field; the refusal is gone, so the level split is now a cost optimisation rather
      // than a correctness one — what these tests pin is WHICH plan each level is composed into,
      // asserted directly off this mock's calls.
      const resolveBlendingDecision = jest.fn((_report: MetricsOnlyPlan) =>
        Promise.resolve({ needsBlending: true, blendedSql: BLENDED_SQL })
      );
      const realBuilder = new BigQueryQueryBuilder(new BigQueryClauseRenderer());
      const composer = new ReportSqlComposerService(
        { resolveBlendingDecision } as never,
        {
          buildQuery: (
            _type: unknown,
            definition: Parameters<BigQueryQueryBuilder['buildQuery']>[0],
            options: Parameters<BigQueryQueryBuilder['buildQuery']>[1]
          ) => realBuilder.buildQuery(definition, options),
        } as never,
        { resolveTableName: jest.fn().mockResolvedValue('`proj`.`ds`.`view_x`') } as never,
        { isSupported: jest.fn().mockReturnValue(true) } as never,
        { computeBlendableSchema: jest.fn() } as never,
        { validateForReport: jest.fn() } as never
      );
      const dryRun = { execute: jest.fn().mockResolvedValue(SqlDryRunResult.success()) };
      return {
        validator: new CalculatedFieldValidatorService(
          createFormulaFunctionDialectRegistry(),
          composer as never,
          dryRun as never,
          { computeBlendableSchema: jest.fn().mockResolvedValue(blendable) } as never
        ),
        dryRun,
        resolveBlendingDecision,
      };
    };

    const accessor = { userId: 'user-1', roles: ['editor'] };
    const joinTree = { dataMartId: 'dm-1', projectId: 'project-1', accessor };
    const ctx = (schema: DataMartSchema) =>
      ({
        dataMart: {
          id: 'dm-1',
          projectId: 'project-1',
          storage: { type: DataStorageType.GOOGLE_BIGQUERY },
          definition: { type: 'table', fullyQualifiedName: 'proj.ds.tbl' },
          schema,
        },
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        credentials: {},
        config: {},
      }) as unknown as DryRunContext;

    it('saves both fields instead of refusing the row-level one over its sibling', async () => {
      const { validator: v } = buildValidator();
      const schema = reportedSchema();

      const result = await v.validate(
        schema,
        DataStorageType.GOOGLE_BIGQUERY,
        ctx(schema),
        joinTree
      );

      expect(result.errors).toEqual([]);
      expect(result.warehouseValidation).toBe('passed');
    });

    it('dry-runs each level as its own composed query — the joined one blended, the row-level one flat', async () => {
      const { validator: v, dryRun, resolveBlendingDecision } = buildValidator();
      const schema = reportedSchema();

      await v.validate(schema, DataStorageType.GOOGLE_BIGQUERY, ctx(schema), joinTree);

      expect(dryRun.execute).toHaveBeenCalledTimes(2);
      const submitted = dryRun.execute.mock.calls.map(call => call[3] as string);
      expect(submitted).toContain(BLENDED_SQL);

      // The row-level half is a REAL composed query for that field alone — rendered through the
      // full builder against the Data Mart's own table, not a synthetic `SELECT <fragment>`.
      const flat = submitted.find(sql => sql !== BLENDED_SQL)!;
      expect(flat).toContain("IF(`cost` > 5, 'asd', 'bsd') AS `str_field_not_agg`");
      expect(flat).toContain('FROM `proj`.`ds`.`tbl`');
      expect(flat).not.toContain('joined_orders_amount');

      // And the row-level field never reaches the blended plan in the first place.
      expect(resolveBlendingDecision).toHaveBeenCalledTimes(1);
      expect(resolveBlendingDecision.mock.calls[0][0].columnConfig).toEqual([
        'joined_orders_amount',
      ]);
    });

    // The split is not a per-level rule but a per-BUILDER one: a mixed schema reading only its own
    // Data Mart composes both levels into one valid flat query (the row-level expression joins the
    // GROUP BY), so charging it a second warehouse submission would tax the common case for a
    // problem it does not have.
    it('still issues ONE dry run for a mixed-level schema that reads no joined Data Mart', async () => {
      const { validator: v, dryRun, resolveBlendingDecision } = buildValidator();
      const schema = localMixedSchema();

      const result = await v.validate(
        schema,
        DataStorageType.GOOGLE_BIGQUERY,
        ctx(schema),
        joinTree
      );

      expect(result.errors).toEqual([]);
      expect(result.warehouseValidation).toBe('passed');
      expect(dryRun.execute).toHaveBeenCalledTimes(1);
      expect(resolveBlendingDecision).not.toHaveBeenCalled();

      const submitted = dryRun.execute.mock.calls[0][3] as string;
      expect(submitted).toContain('total_cost');
      expect(submitted).toContain('str_field_not_agg');
      expect(submitted).toContain('GROUP BY');
    });
  });
});
