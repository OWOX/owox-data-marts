jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { UpdateDataMartSchemaCommand } from '../dto/domain/update-data-mart-schema.command';
import { UpdateDataMartSchemaService } from './update-data-mart-schema.service';

describe('UpdateDataMartSchemaService', () => {
  // What a command carrying no user identity forwards for joined-reference resolution; the
  // validator skips the join-tree read for it (see JoinTreeContext).
  const anonymousJoinTree = {
    dataMartId: 'target-1',
    projectId: 'project-1',
    accessor: { userId: '', roles: [] },
  };

  const buildService = (opts: {
    validate: jest.Mock;
    parsedSchema?: unknown;
    dataMart?: Record<string, unknown>;
    resolveCredentials?: jest.Mock;
  }) => {
    const parsedSchema = opts.parsedSchema ?? { type: 'bigquery-data-mart-schema', fields: [] };
    const dataMart = opts.dataMart ?? {
      id: 'target-1',
      projectId: 'project-1',
      storage: { type: DataStorageType.GOOGLE_BIGQUERY },
      schema: null,
    };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
      save: jest.fn().mockResolvedValue(dataMart),
    };
    const schemaParserFacade = {
      validateAndParse: jest.fn().mockResolvedValue(parsedSchema),
    };
    const calculatedFieldValidator = {
      validate: opts.validate,
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'target-1' }),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };
    const credentialsResolver = {
      resolve: opts.resolveCredentials ?? jest.fn().mockResolvedValue({ type: 'oauth' }),
    };
    const searchIndexInvalidation = {
      scheduleDataMartSchemaChanged: jest.fn().mockResolvedValue(undefined),
    };
    const reportDataCacheService = {
      invalidateByDataMartId: jest.fn().mockResolvedValue(undefined),
    };
    const service = new UpdateDataMartSchemaService(
      dataMartService as never,
      reportDataCacheService as never,
      schemaParserFacade as never,
      calculatedFieldValidator as never,
      mapper as never,
      accessDecisionService as never,
      credentialsResolver as never,
      searchIndexInvalidation as never
    );
    return {
      service,
      dataMartService,
      schemaParserFacade,
      mapper,
      dataMart,
      credentialsResolver,
      searchIndexInvalidation,
      reportDataCacheService,
    };
  };

  it('schedules data mart schema search invalidation after saving the parsed schema', async () => {
    const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
    const { service, dataMartService, schemaParserFacade, searchIndexInvalidation, dataMart } =
      buildService({ validate });
    const parsedSchema = await schemaParserFacade.validateAndParse();

    await service.run(
      new UpdateDataMartSchemaCommand('target-1', 'project-1', parsedSchema as never)
    );

    expect(dataMart.schema).toBe(parsedSchema);
    expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
    expect(searchIndexInvalidation.scheduleDataMartSchemaChanged).toHaveBeenCalledWith(
      'target-1',
      'project-1'
    );
  });

  // A cached Looker Studio reader is keyed on `report.id` + `expiresAt` alone — nothing in the key
  // fingerprints the schema — so an edited formula stays invisible to it for up to `cacheLifetime`
  // seconds, which has a floor (60) and no ceiling. Until this call existed, correcting a formula
  // left Looker serving the OLD formula's numbers under the OLD headers, exactly as toggling a
  // blended field would have if `UpdateBlendedFieldsConfigService` had not invalidated.
  describe('report data cache invalidation', () => {
    it('invalidates every cached report of the data mart after saving the schema', async () => {
      const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
      const { service, dataMartService, reportDataCacheService } = buildService({ validate });

      await service.run(new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never));

      expect(reportDataCacheService.invalidateByDataMartId).toHaveBeenCalledWith('target-1');
      // Ordering is load-bearing, not cosmetic: invalidating BEFORE the save leaves a window in
      // which a concurrent Looker refresh refills the cache from the still-old schema, and that
      // fresh row then outlives the edit for a full cache lifetime.
      expect(
        reportDataCacheService.invalidateByDataMartId.mock.invocationCallOrder[0]
      ).toBeGreaterThan(dataMartService.save.mock.invocationCallOrder[0]);
    });

    it('leaves the cache alone when the save is rejected', async () => {
      const validate = jest.fn().mockResolvedValue({
        errors: [{ code: 'FORMULA_LEVEL_MIXING', field: 'ctr', message: 'row-level' }],
        warnings: [],
      });
      const { service, reportDataCacheService } = buildService({ validate });

      await expect(
        service.run(new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never))
      ).rejects.toThrow();

      expect(reportDataCacheService.invalidateByDataMartId).not.toHaveBeenCalled();
    });
  });

  it('rejects the save when a formula is invalid, naming the field', async () => {
    const validate = jest.fn().mockResolvedValue({
      errors: [
        { code: 'FORMULA_LEVEL_MIXING', field: 'ctr', message: '`clicks` is a row-level column.' },
      ],
      warnings: [],
    });
    const { service, dataMartService } = buildService({ validate });

    await expect(
      service.run(new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never))
    ).rejects.toMatchObject({
      message: 'Calculated field validation failed',
      errorDetails: {
        errors: [expect.objectContaining({ field: 'ctr', code: 'FORMULA_LEVEL_MIXING' })],
      },
    });

    // A rejected formula must not reach the database — the invalid schema is never persisted.
    expect(dataMartService.save).not.toHaveBeenCalled();
  });

  it('returns warnings on a successful save', async () => {
    const validate = jest.fn().mockResolvedValue({
      errors: [],
      warnings: [
        {
          code: 'FORMULA_UNGUARDED_DIVISION',
          field: 'ctr',
          message: 'This formula divides without guarding against a zero or empty denominator.',
        },
      ],
    });
    const { service } = buildService({ validate });

    const result = await service.run(
      new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never)
    );

    expect(result.warnings).toEqual([
      expect.objectContaining({ field: 'ctr', code: 'FORMULA_UNGUARDED_DIVISION' }),
    ]);
  });

  it('returns an empty warnings array on a clean save', async () => {
    const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
    const { service } = buildService({ validate });

    const result = await service.run(
      new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never)
    );

    expect(result.warnings).toEqual([]);
  });

  it('validates against the parsed schema and the data mart storage type', async () => {
    const parsedSchema = { type: 'bigquery-data-mart-schema', fields: [] };
    const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
    const { service } = buildService({ validate, parsedSchema });

    await service.run(new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never));

    // No calculated fields in this schema — no warehouse dry-run context is built at all.
    expect(validate).toHaveBeenCalledWith(
      parsedSchema,
      DataStorageType.GOOGLE_BIGQUERY,
      undefined,
      anonymousJoinTree
    );
  });

  describe('warehouse dry-run context', () => {
    const calculatedFieldSchema = {
      type: 'bigquery-data-mart-schema',
      fields: [
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        },
      ],
    };

    it('resolves storage credentials and passes a dry-run context when the schema carries a calculated field', async () => {
      const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
      const resolveCredentials = jest.fn().mockResolvedValue({ type: 'oauth', token: 'tkn' });
      const dataMart = {
        id: 'target-1',
        projectId: 'project-1',
        storage: {
          type: DataStorageType.GOOGLE_BIGQUERY,
          config: { projectId: 'gcp-proj' },
          credentialId: 'cred-1',
        },
        schema: null,
      };
      const { service } = buildService({
        validate,
        parsedSchema: calculatedFieldSchema,
        dataMart,
        resolveCredentials,
      });

      await service.run(
        new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never, 'user-1', ['editor'])
      );

      expect(resolveCredentials).toHaveBeenCalledWith(dataMart.storage);
      expect(validate).toHaveBeenCalledWith(
        calculatedFieldSchema,
        DataStorageType.GOOGLE_BIGQUERY,
        {
          dataMart,
          storageType: DataStorageType.GOOGLE_BIGQUERY,
          credentials: { type: 'oauth', token: 'tkn' },
          config: { projectId: 'gcp-proj' },
        },
        // The saving user, forwarded so a formula naming a joined Data Mart can have its path
        // resolved against that user's view of the join tree.
        {
          dataMartId: 'target-1',
          projectId: 'project-1',
          accessor: { userId: 'user-1', roles: ['editor'] },
        }
      );
    });

    it('never resolves storage credentials when the schema has no calculated fields — most saves touch no formula at all', async () => {
      const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
      const resolveCredentials = jest.fn().mockResolvedValue({ type: 'oauth' });
      const dataMart = {
        id: 'target-1',
        projectId: 'project-1',
        storage: {
          type: DataStorageType.GOOGLE_BIGQUERY,
          config: { projectId: 'gcp-proj' },
          credentialId: 'cred-1',
        },
        schema: null,
      };
      const { service } = buildService({
        validate,
        parsedSchema: { type: 'bigquery-data-mart-schema', fields: [] },
        dataMart,
        resolveCredentials,
      });

      await service.run(new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never));

      expect(resolveCredentials).not.toHaveBeenCalled();
      expect(validate).toHaveBeenCalledWith(
        { type: 'bigquery-data-mart-schema', fields: [] },
        DataStorageType.GOOGLE_BIGQUERY,
        undefined,
        anonymousJoinTree
      );
    });

    it('skips the dry-run context — parser-only validation — when storage has no config yet, but treats it exactly like an unreachable warehouse (Important 4): save succeeds, stamped skipped, with a warning', async () => {
      const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
      const resolveCredentials = jest.fn().mockResolvedValue({ type: 'oauth' });
      const dataMart = {
        id: 'target-1',
        projectId: 'project-1',
        storage: { type: DataStorageType.GOOGLE_BIGQUERY },
        schema: null,
      };
      // Deep-cloned so the schema passed to `parsedSchema` below isn't the very same object the
      // service later mutates with the warehouseValidation stamp — keeps this test's `calculatedFieldSchema`
      // fixture reusable and unmutated across other tests in this file.
      const parsedSchema = JSON.parse(JSON.stringify(calculatedFieldSchema));
      const { service, dataMartService } = buildService({
        validate,
        parsedSchema,
        dataMart,
        resolveCredentials,
      });

      const result = await service.run(
        new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never)
      );

      expect(resolveCredentials).not.toHaveBeenCalled();
      expect(validate).toHaveBeenCalledWith(
        parsedSchema,
        DataStorageType.GOOGLE_BIGQUERY,
        undefined,
        // Still resolved: a join tree does not depend on the warehouse being configured.
        anonymousJoinTree
      );
      // Silence is the bug this rules against: a warehouse that is never actually checked must
      // still surface a warning, not just fall back to parser-only with no signal at all.
      expect(result.warnings).toEqual([
        expect.objectContaining({ code: 'FORMULA_WAREHOUSE_CHECK_SKIPPED' }),
      ]);
      const saved = dataMartService.save.mock.calls[0][0] as { schema: typeof parsedSchema };
      expect(saved.schema.fields[0].calculated.warehouseValidation).toBe('skipped');
    });

    // The third way the check can fail to happen, and the one that used to 500 instead of
    // degrading: the storage IS configured, so neither guard around it applies, but resolving its
    // credential throws — no linked credential, or a revoked BigQuery OAuth grant. Every save
    // carrying a formula died there, including the save that removes the formula and would have
    // gotten the Data Mart out of that state.
    it('degrades to a skipped stamp, not a 500, when credentials cannot be resolved', async () => {
      const validate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });
      const resolveCredentials = jest
        .fn()
        .mockRejectedValue(new Error('No credentials linked to this storage'));
      const dataMart = {
        id: 'target-1',
        projectId: 'project-1',
        storage: { type: DataStorageType.GOOGLE_BIGQUERY, config: { projectId: 'p' } },
        schema: null,
      };
      const parsedSchema = JSON.parse(JSON.stringify(calculatedFieldSchema));
      const { service, dataMartService } = buildService({
        validate,
        parsedSchema,
        dataMart,
        resolveCredentials,
      });

      const result = await service.run(
        new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never)
      );

      expect(resolveCredentials).toHaveBeenCalled();
      // No context, so the validator runs parser-only — exactly the unreachable-warehouse path.
      expect(validate).toHaveBeenCalledWith(
        parsedSchema,
        DataStorageType.GOOGLE_BIGQUERY,
        undefined,
        anonymousJoinTree
      );
      expect(result.warnings).toEqual([
        expect.objectContaining({ code: 'FORMULA_WAREHOUSE_CHECK_SKIPPED' }),
      ]);
      const saved = dataMartService.save.mock.calls[0][0] as { schema: typeof parsedSchema };
      expect(saved.schema.fields[0].calculated.warehouseValidation).toBe('skipped');
    });
  });

  describe('the dry-run context composes from the schema BEING SAVED, never the stale persisted one (Critical 1 regression)', () => {
    // `dataMart` is a single, shared, MUTABLE object reference throughout `run()` — asserting on
    // its `.schema` AFTER `run()` resolves proves nothing about ordering, since both the buggy and
    // the fixed code eventually settle it to the same value. What actually distinguishes them is
    // what `ctx.dataMart.schema` holds AT THE MOMENT `validate` (and, through it,
    // `composeMetricsOnly`) is invoked — so these tests snapshot it synchronously inside a
    // `mockImplementation`, deep-cloned so later mutation on the shared object can't retroactively
    // "fix" an already-captured, stale read.
    it('lets a brand-new calculated field validate cleanly, even though it is absent from the OLD persisted schema', async () => {
      let capturedSchemaAtCallTime: unknown;
      const validate = jest.fn().mockImplementation(async (_schema, _type, ctx) => {
        capturedSchemaAtCallTime = ctx ? JSON.parse(JSON.stringify(ctx.dataMart.schema)) : ctx;
        return { errors: [], warnings: [] };
      });
      const oldSchema = {
        type: 'bigquery-data-mart-schema',
        fields: [{ name: 'clicks', type: 'INTEGER' }], // no 'ctr' yet — it is brand new this save
      };
      const newSchema = {
        type: 'bigquery-data-mart-schema',
        fields: [
          { name: 'clicks', type: 'INTEGER' },
          {
            name: 'ctr',
            type: 'FLOAT',
            calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
          },
        ],
      };
      const dataMart = {
        id: 'target-1',
        projectId: 'project-1',
        storage: {
          type: DataStorageType.GOOGLE_BIGQUERY,
          config: { projectId: 'gcp-proj' },
          credentialId: 'cred-1',
        },
        schema: oldSchema,
      };
      const { service } = buildService({ validate, parsedSchema: newSchema, dataMart });

      await service.run(new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never));

      // Had the context still carried `oldSchema`, `composeMetricsOnly` would project 'ctr' as a
      // bare, nonexistent column against a schema that never heard of it.
      expect(capturedSchemaAtCallTime).toEqual(newSchema);
    });

    it('validates an edited formula in its NEW form, not the formula still in the OLD persisted schema', async () => {
      let capturedFormulaAtCallTime: string | undefined;
      const validate = jest.fn().mockImplementation(async (_schema, _type, ctx) => {
        const fields = ctx?.dataMart.schema?.fields as
          | { name: string; calculated?: { formula: string } }[]
          | undefined;
        capturedFormulaAtCallTime = fields?.find(f => f.name === 'ctr')?.calculated?.formula;
        return { errors: [], warnings: [] };
      });
      const oldFormula = 'SUM({{ref field="clicks"}})'; // the edit below replaces this
      const newFormula =
        'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
      const oldSchema = {
        type: 'bigquery-data-mart-schema',
        fields: [
          {
            name: 'ctr',
            type: 'FLOAT',
            calculated: { formula: oldFormula, level: 'metric' },
          },
        ],
      };
      const newSchema = {
        type: 'bigquery-data-mart-schema',
        fields: [
          {
            name: 'ctr',
            type: 'FLOAT',
            calculated: { formula: newFormula, level: 'metric' },
          },
        ],
      };
      const dataMart = {
        id: 'target-1',
        projectId: 'project-1',
        storage: {
          type: DataStorageType.GOOGLE_BIGQUERY,
          config: { projectId: 'gcp-proj' },
          credentialId: 'cred-1',
        },
        schema: oldSchema,
      };
      const { service } = buildService({ validate, parsedSchema: newSchema, dataMart });

      await service.run(new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never));

      // Had the context still carried `oldSchema`, the OLD formula would be what actually got
      // dry-run while the NEW (possibly broken) one was the one persisted as 'passed'.
      expect(capturedFormulaAtCallTime).toBe(newFormula);
    });
  });

  describe('the warehouseValidation stamp is persisted onto the saved schema (Important 3)', () => {
    const oneMetricSchema = {
      type: 'bigquery-data-mart-schema',
      fields: [
        { name: 'clicks', type: 'INTEGER' },
        {
          name: 'ctr',
          type: 'FLOAT',
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        },
      ],
    };

    const buildConfiguredDataMart = () => ({
      id: 'target-1',
      projectId: 'project-1',
      storage: {
        type: DataStorageType.GOOGLE_BIGQUERY,
        config: { projectId: 'gcp-proj' },
        credentialId: 'cred-1',
      },
      schema: null,
    });

    it('writes "passed" onto every calculated field before saving', async () => {
      const validate = jest
        .fn()
        .mockResolvedValue({ errors: [], warnings: [], warehouseValidation: 'passed' });
      // Deep-cloned so the save-time mutation this test asserts on can't leak into the shared
      // `oneMetricSchema` fixture used by the sibling test below.
      const parsedSchema = JSON.parse(JSON.stringify(oneMetricSchema));
      const dataMart = buildConfiguredDataMart();
      const { service, dataMartService } = buildService({ validate, parsedSchema, dataMart });

      await service.run(new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never));

      const saved = dataMartService.save.mock.calls[0][0] as { schema: typeof parsedSchema };
      expect(saved.schema.fields.find(f => f.name === 'ctr')?.calculated.warehouseValidation).toBe(
        'passed'
      );
    });

    it('writes "skipped" onto every calculated field when the warehouse was unreachable', async () => {
      const validate = jest.fn().mockResolvedValue({
        errors: [],
        warnings: [
          { code: 'FORMULA_WAREHOUSE_CHECK_SKIPPED', field: 'ctr', message: 'unreachable' },
        ],
        warehouseValidation: 'skipped',
      });
      const parsedSchema = JSON.parse(JSON.stringify(oneMetricSchema));
      const dataMart = buildConfiguredDataMart();
      const { service, dataMartService } = buildService({ validate, parsedSchema, dataMart });

      await service.run(new UpdateDataMartSchemaCommand('target-1', 'project-1', {} as never));

      const saved = dataMartService.save.mock.calls[0][0] as { schema: typeof parsedSchema };
      expect(saved.schema.fields.find(f => f.name === 'ctr')?.calculated.warehouseValidation).toBe(
        'skipped'
      );
    });
  });
});
