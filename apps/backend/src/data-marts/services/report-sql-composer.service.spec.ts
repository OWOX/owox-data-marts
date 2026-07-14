import { BadRequestException } from '@nestjs/common';
import { ReportSqlComposerService } from './report-sql-composer.service';
import { Report } from '../entities/report.entity';
import { BigQueryQueryBuilder } from '../data-storage-types/bigquery/services/bigquery-query.builder';
import { BigQueryClauseRenderer } from '../data-storage-types/bigquery/services/bigquery-clause-renderer';
import { AthenaQueryBuilder } from '../data-storage-types/athena/services/athena-query.builder';
import { AthenaClauseRenderer } from '../data-storage-types/athena/services/athena-clause-renderer';
import { isQueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

describe('ReportSqlComposerService', () => {
  const buildReport = (overrides: Partial<Report> = {}): Report =>
    ({
      id: 'rep-1',
      title: 'Report',
      dataMart: {
        id: 'dm-1',
        definition: { sqlQuery: 'SELECT 1' },
        storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY' },
      },
      ...overrides,
    }) as unknown as Report;

  const createService = (
    decision: { needsBlending: boolean; blendedSql?: string; columnFilter?: string[] },
    builtSql = 'SELECT built FROM dm',
    capabilitySupported = true
  ) => {
    const blendedReportDataService = {
      resolveBlendingDecision: jest.fn().mockResolvedValue(decision),
    };
    const queryBuilderFacade = {
      buildQuery: jest.fn().mockResolvedValue(builtSql),
    };
    const tableReferenceService = {
      resolveTableName: jest.fn().mockResolvedValue('p.d.t'),
    };
    const capabilityService = {
      isSupported: jest.fn().mockReturnValue(capabilitySupported),
    };
    const blendableSchemaService = { computeBlendableSchema: jest.fn() };

    const service = new ReportSqlComposerService(
      blendedReportDataService as never,
      queryBuilderFacade as never,
      tableReferenceService as never,
      capabilityService as never,
      blendableSchemaService as never
    );

    return {
      service,
      blendedReportDataService,
      queryBuilderFacade,
      tableReferenceService,
      capabilityService,
    };
  };

  it('delegates schema-drift validation to resolveBlendingDecision (single chokepoint)', async () => {
    const { service, blendedReportDataService } = createService(
      { needsBlending: false, columnFilter: ['a'] },
      'SELECT 1'
    );
    const report = buildReport({
      columnConfig: ['a'],
      filterConfig: [{ column: 'a', operator: 'eq', value: 1 }],
      sortConfig: [{ column: 'a', direction: 'asc' }],
      limitConfig: 50,
    } as Partial<Report>);

    await service.compose(report, { userId: 'user-1', roles: ['admin'] });

    expect(blendedReportDataService.resolveBlendingDecision).toHaveBeenCalledTimes(1);
    expect(blendedReportDataService.resolveBlendingDecision).toHaveBeenCalledWith(
      report,
      { userId: 'user-1', roles: ['admin'] },
      undefined
    );
  });

  it('propagates validator rejection thrown by resolveBlendingDecision', async () => {
    const { service, blendedReportDataService } = createService({
      needsBlending: false,
      columnFilter: ['a'],
    });
    const validatorError = new BadRequestException({
      message: 'Output controls validation failed',
      details: { errors: [{ code: 'FILTER_COLUMN_UNKNOWN', column: 'stale_col' }] },
    });
    blendedReportDataService.resolveBlendingDecision.mockRejectedValue(validatorError);

    await expect(
      service.compose(buildReport(), { userId: 'user-1', roles: ['admin'] })
    ).rejects.toBe(validatorError);
  });

  it('returns blended SQL when decision.needsBlending and blendedSql is present', async () => {
    const { service, queryBuilderFacade } = createService({
      needsBlending: true,
      blendedSql: 'SELECT blended FROM cte',
    });

    const result = await service.compose(buildReport(), { userId: 'user-1', roles: ['admin'] });

    expect(result.sql).toBe('SELECT blended FROM cte');
    expect(queryBuilderFacade.buildQuery).not.toHaveBeenCalled();
  });

  it('falls back to the query builder facade when blending is not needed', async () => {
    const { service, queryBuilderFacade } = createService(
      { needsBlending: false, columnFilter: ['a', 'b'] },
      'SELECT a, b FROM dm'
    );

    const result = await service.compose(buildReport(), { userId: 'user-1', roles: ['admin'] });

    expect(result.sql).toBe('SELECT a, b FROM dm');
    expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
      'GOOGLE_BIGQUERY',
      { sqlQuery: 'SELECT 1' },
      expect.objectContaining({ columns: ['a', 'b'] })
    );
  });

  it('throws BLENDED_SQL_UNAVAILABLE when needsBlending is true but blendedSql is missing', async () => {
    // Previously this case silently fell through to the simple-query path, which
    // would drop slice/filter semantics for the joined mart. The composer must
    // now fail loudly so the user (and oncall) immediately know that no blended
    // builder is registered for this storage type.
    const { service, queryBuilderFacade } = createService(
      { needsBlending: true, columnFilter: undefined },
      'SELECT fallback FROM dm'
    );

    await expect(
      service.compose(buildReport(), { userId: 'user-1', roles: ['admin'] })
    ).rejects.toMatchObject({
      response: {
        details: { errors: [{ code: 'BLENDED_SQL_UNAVAILABLE' }] },
      },
    });
    expect(queryBuilderFacade.buildQuery).not.toHaveBeenCalled();
  });

  it('throws when the fallback path is taken but the DataMart has no definition', async () => {
    const { service } = createService({ needsBlending: false });

    const report = buildReport({
      dataMart: {
        id: 'dm-1',
        definition: undefined,
        storage: { id: 'storage-1', type: 'BIGQUERY' },
      } as never,
    });

    await expect(service.compose(report, { userId: 'user-1', roles: ['admin'] })).rejects.toThrow(
      'Data Mart definition is not set.'
    );
  });

  it('passes filterConfig/sortConfig/limitConfig from Report to QueryBuilder', async () => {
    const queryBuilderFacade = {
      buildQuery: jest
        .fn()
        .mockResolvedValue({ sql: 'SELECT 1', params: [{ name: 'p0', value: 1 }] }),
    };
    const blendedDataService = {
      resolveBlendingDecision: jest
        .fn()
        .mockResolvedValue({ needsBlending: false, columnFilter: ['a'] }),
    };
    const tableReferenceService = { resolveTableName: jest.fn().mockResolvedValue('p.d.view_x') };
    const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
    const blendableSchemaService = { computeBlendableSchema: jest.fn() };
    const composer = new ReportSqlComposerService(
      blendedDataService as never,
      queryBuilderFacade as never,
      tableReferenceService as never,
      capabilityService as never,
      blendableSchemaService as never
    );
    const filterConfig = [{ column: 'a', operator: 'eq', value: 1 }];
    const sortConfig = [{ column: 'a', direction: 'asc' }];
    const report = {
      filterConfig,
      sortConfig,
      limitConfig: 10,
      dataMart: {
        id: 'm',
        projectId: 'p',
        storage: { type: 'GOOGLE_BIGQUERY' },
        definition: { type: 'sql', sqlQuery: 'SELECT 1' },
      },
    } as never;
    const result = await composer.compose(report, { userId: 'user-1', roles: ['admin'] });
    expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
      'GOOGLE_BIGQUERY',
      expect.anything(),
      expect.objectContaining({
        columns: ['a'],
        filters: filterConfig,
        sort: sortConfig,
        limit: 10,
        mainTableReference: 'p.d.view_x',
      })
    );
    expect(result).toEqual({ sql: 'SELECT 1', params: [{ name: 'p0', value: 1 }] });
  });

  it('passes recursive native field types to QueryBuilder for nested output controls', async () => {
    const queryBuilderFacade = {
      buildQuery: jest.fn().mockResolvedValue({ sql: 'SELECT 1', params: [] }),
    };
    const blendedDataService = {
      resolveBlendingDecision: jest.fn().mockResolvedValue({
        needsBlending: false,
        columnFilter: ['user.created_at'],
      }),
    };
    const tableReferenceService = { resolveTableName: jest.fn().mockResolvedValue('p.d.view_x') };
    const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
    const blendableSchemaService = { computeBlendableSchema: jest.fn() };
    const composer = new ReportSqlComposerService(
      blendedDataService as never,
      queryBuilderFacade as never,
      tableReferenceService as never,
      capabilityService as never,
      blendableSchemaService as never
    );
    const filterConfig = [
      {
        column: 'user.created_at',
        operator: 'relative_date',
        value: { kind: 'last_n_days', n: 7 },
      },
    ];
    const report = {
      filterConfig,
      sortConfig: [{ column: 'user.created_at', direction: 'asc' }],
      limitConfig: null,
      dataMart: {
        id: 'm',
        projectId: 'p',
        storage: { type: 'GOOGLE_BIGQUERY' },
        definition: { type: 'sql', sqlQuery: 'SELECT 1' },
        schema: {
          fields: [
            {
              name: 'user',
              type: 'RECORD',
              status: 'CONNECTED',
              fields: [{ name: 'created_at', type: 'TIMESTAMP', status: 'CONNECTED' }],
            },
          ],
        },
      },
    } as never;

    await composer.compose(report, { userId: 'user-1', roles: ['admin'] });

    const options = queryBuilderFacade.buildQuery.mock.calls[0][2];
    expect(options.columnTypes.get('user.created_at')).toBe('TIMESTAMP');
  });

  it('does not resolve mainTableReference when no output controls', async () => {
    const tableReferenceService = { resolveTableName: jest.fn() };
    const queryBuilderFacade = { buildQuery: jest.fn().mockResolvedValue('SELECT * FROM t') };
    const blendedDataService = {
      resolveBlendingDecision: jest
        .fn()
        .mockResolvedValue({ needsBlending: false, columnFilter: ['a'] }),
    };
    const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
    const blendableSchemaService = { computeBlendableSchema: jest.fn() };
    const composer = new ReportSqlComposerService(
      blendedDataService as never,
      queryBuilderFacade as never,
      tableReferenceService as never,
      capabilityService as never,
      blendableSchemaService as never
    );
    const report = {
      dataMart: {
        id: 'm',
        projectId: 'p',
        storage: { type: 'GOOGLE_BIGQUERY' },
        definition: { type: 'table', fullyQualifiedName: 'p.d.t' },
      },
    } as never;
    const result = await composer.compose(report, { userId: 'user-1', roles: ['admin'] });
    expect(tableReferenceService.resolveTableName).not.toHaveBeenCalled();
    expect(result).toEqual({ sql: 'SELECT * FROM t' });
  });

  it('uses blended sql + params when needsBlending=true', async () => {
    const blendedDataService = {
      resolveBlendingDecision: jest.fn().mockResolvedValue({
        needsBlending: true,
        blendedSql: 'WITH ... SELECT ... WHERE @p0',
        params: [{ name: 'p0', value: 1 }],
      }),
    };
    const composer = new ReportSqlComposerService(
      blendedDataService as never,
      {} as never,
      {} as never,
      { isSupported: jest.fn() } as never,
      { computeBlendableSchema: jest.fn() } as never
    );
    const result = await composer.compose(
      {
        filterConfig: [{ column: 'a', operator: 'eq', value: 1 }],
        dataMart: {
          id: 'm',
          projectId: 'p',
          storage: { type: 'GOOGLE_BIGQUERY' },
        },
      } as never,
      { userId: 'user-1', roles: ['admin'] }
    );
    expect(result).toEqual({
      sql: 'WITH ... SELECT ... WHERE @p0',
      params: [{ name: 'p0', value: 1 }],
    });
  });

  it('throws BadRequestException when storage does not support output controls (defence-in-depth)', async () => {
    const { service, capabilityService, queryBuilderFacade } = createService(
      { needsBlending: false, columnFilter: ['a'] },
      'SELECT 1',
      false // capability service reports unsupported
    );

    const report = {
      filterConfig: [{ column: 'a', operator: 'eq', value: 1 }],
      sortConfig: null,
      limitConfig: null,
      dataMart: {
        id: 'dm-1',
        projectId: 'p',
        storage: { type: 'AWS_REDSHIFT' },
        definition: { sqlQuery: 'SELECT 1' },
      },
    } as never;

    await expect(service.compose(report, { userId: 'user-1', roles: ['admin'] })).rejects.toThrow(
      BadRequestException
    );
    expect(capabilityService.isSupported).toHaveBeenCalledWith('AWS_REDSHIFT');
    expect(queryBuilderFacade.buildQuery).not.toHaveBeenCalled();
  });

  it('skips capability check when there are no output controls', async () => {
    const { service, capabilityService } = createService(
      { needsBlending: false, columnFilter: ['a'] },
      'SELECT 1',
      false
    );

    const report = {
      filterConfig: null,
      sortConfig: null,
      limitConfig: null,
      dataMart: {
        id: 'dm-1',
        projectId: 'p',
        storage: { type: 'AWS_REDSHIFT' },
        definition: { sqlQuery: 'SELECT 1' },
      },
    } as never;

    await expect(
      service.compose(report, { userId: 'user-1', roles: ['admin'] })
    ).resolves.toBeDefined();
    expect(capabilityService.isSupported).not.toHaveBeenCalled();
  });

  it('throws PRE_JOIN_FILTERS_REQUIRE_JOINED_DATA_MART when a pre-join filter is set on a simple data mart', async () => {
    const { service } = createService({ needsBlending: false, columnFilter: ['a'] });
    const report = buildReport({
      filterConfig: [
        {
          column: 'userRole',
          operator: 'eq',
          value: 'admin',
          placement: 'pre-join',
          aliasPath: 'users',
        },
      ],
    } as never);
    await expect(
      service.compose(report, { userId: 'user-1', roles: ['admin'] })
    ).rejects.toMatchObject({
      response: {
        details: { errors: [{ code: 'PRE_JOIN_FILTERS_REQUIRE_JOINED_DATA_MART' }] },
      },
    });
  });

  it('throws OUTPUT_CONTROLS_NOT_SUPPORTED on the simple-query path for unsupported storages', async () => {
    // Non-blended path with output controls on a storage that lacks output
    // controls support — must throw the existing structured error before
    // calling the query builder facade.
    const { service, queryBuilderFacade, capabilityService } = createService(
      { needsBlending: false, columnFilter: ['a'] },
      'SELECT 1',
      /* capabilitySupported */ false
    );
    const report = buildReport({
      dataMart: {
        id: 'dm-1',
        definition: { sqlQuery: 'SELECT 1' },
        storage: { id: 'storage-1', type: DataStorageType.SNOWFLAKE },
      },
      filterConfig: [{ column: 'a', operator: 'eq', value: 1 }],
    } as never);
    await expect(
      service.compose(report, { userId: 'user-1', roles: ['admin'] })
    ).rejects.toMatchObject({
      response: {
        details: { errors: [{ code: 'OUTPUT_CONTROLS_NOT_SUPPORTED' }] },
      },
    });
    expect(capabilityService.isSupported).toHaveBeenCalledWith(DataStorageType.SNOWFLAKE);
    expect(queryBuilderFacade.buildQuery).not.toHaveBeenCalled();
  });

  // E2E composition: wires the *real* BigQueryQueryBuilder + BigQueryClauseRenderer
  // behind a stub facade so we can assert that the SQL emitted to the executor
  // contains named parameter placeholders (@p0, @p1, ...) and the matching
  // parameter array — proving the parameterization promise end-to-end at the
  // composer layer (one level below BigQueryReportReaderService → BigQueryApiAdapter).
  describe('E2E SQL + parameter binding for non-blended BQ report', () => {
    function makeBqComposer() {
      const realBuilder = new BigQueryQueryBuilder(new BigQueryClauseRenderer());
      const facade = {
        buildQuery: (
          _type: unknown,
          definition: Parameters<BigQueryQueryBuilder['buildQuery']>[0],
          options: Parameters<BigQueryQueryBuilder['buildQuery']>[1]
        ) => realBuilder.buildQuery(definition, options),
      };
      const blendedDataService = {
        resolveBlendingDecision: jest
          .fn()
          .mockResolvedValue({ needsBlending: false, columnFilter: ['name', 'amount'] }),
      };
      const tableReferenceService = {
        resolveTableName: jest.fn().mockResolvedValue('`proj`.`ds`.`view_x`'),
      };
      const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
      const blendableSchemaService = { computeBlendableSchema: jest.fn() };

      return new ReportSqlComposerService(
        blendedDataService as never,
        facade as never,
        tableReferenceService as never,
        capabilityService as never,
        blendableSchemaService as never
      );
    }

    it('parameterizes scalar filter values, renders ORDER BY and LIMIT', async () => {
      const composer = makeBqComposer();
      const report = {
        filterConfig: [
          { column: 'name', operator: 'eq', value: 'X' },
          { column: 'amount', operator: 'between', value: { from: 10, to: 100 } },
        ],
        sortConfig: [{ column: 'amount', direction: 'desc' }],
        limitConfig: 50,
        dataMart: {
          id: 'dm-1',
          projectId: 'p',
          storage: { type: 'GOOGLE_BIGQUERY' },
          definition: { type: 'table', fullyQualifiedName: 'proj.ds.tbl' },
        },
      } as never;

      const result = await composer.compose(report, { userId: 'user-1', roles: ['admin'] });

      expect(result.sql).toContain('SELECT\n  `name`,\n  `amount`');
      expect(result.sql).toContain('FROM `proj`.`ds`.`tbl` AS src');
      expect(result.sql).toContain('WHERE src.`name` = @p0');
      expect(result.sql).toContain('AND src.`amount` BETWEEN @p1 AND @p2');
      expect(result.sql).toContain('ORDER BY\n  src.`amount` DESC');
      expect(result.sql).toContain('LIMIT 50');

      // The full param array — proves no string interpolation of user values.
      expect(result.params).toEqual([
        { name: 'p0', value: 'X' },
        { name: 'p1', value: 10 },
        { name: 'p2', value: 100 },
      ]);
      // Nothing in the SQL contains the raw user value 'X'.
      expect(result.sql).not.toContain("'X'");
      expect(result.sql).not.toContain('"X"');
    });

    it('binds STRPOS-based contains without LIKE wildcards in the value', async () => {
      const composer = makeBqComposer();
      const report = {
        // Wildcard chars in the user input must NOT smuggle through to LIKE
        // semantics — we use STRPOS / STARTS_WITH / ENDS_WITH instead.
        filterConfig: [{ column: 'name', operator: 'contains', value: '100%' }],
        sortConfig: null,
        limitConfig: null,
        dataMart: {
          id: 'dm-1',
          projectId: 'p',
          storage: { type: 'GOOGLE_BIGQUERY' },
          definition: { type: 'table', fullyQualifiedName: 'proj.ds.tbl' },
        },
      } as never;

      const result = await composer.compose(report, { userId: 'user-1', roles: ['admin'] });

      expect(result.sql).toContain('STRPOS(src.`name`, @p0) > 0');
      expect(result.sql).not.toMatch(/LIKE/);
      expect(result.params).toEqual([{ name: 'p0', value: '100%' }]);
    });

    it('passes through generated SQL as QueryBuildResult (sql + params, both present)', async () => {
      const composer = makeBqComposer();
      const report = {
        filterConfig: [{ column: 'name', operator: 'is_empty' }],
        sortConfig: null,
        limitConfig: null,
        dataMart: {
          id: 'dm-1',
          projectId: 'p',
          storage: { type: 'GOOGLE_BIGQUERY' },
          definition: { type: 'table', fullyQualifiedName: 'proj.ds.tbl' },
        },
      } as never;

      const result = await composer.compose(report, { userId: 'user-1', roles: ['admin'] });

      // is_empty has zero params but the result still must come back as a
      // QueryBuildResult shape so the executor handles it uniformly.
      expect(isQueryBuildResult({ sql: result.sql, params: result.params ?? [] })).toBe(true);
      expect(result.params).toEqual([]);
      expect(result.sql).toContain("(src.`name` IS NULL OR src.`name` = '')");
    });
  });

  // Schema-drift re-validation (Athena storage context)
  //
  // The composer re-validates output controls against the CURRENT data mart schema
  // before composing by delegating to blendedReportDataService.resolveBlendingDecision.
  // When the validator detects a stale/renamed column or an operator now invalid for
  // the changed column type, resolveBlendingDecision throws a BadRequestException with
  // structured details.errors — the composer must surface it as-is (not swallow it as
  // a 500).  These tests verify the plumbing on an AWS_ATHENA-typed data mart.
  describe('schema-drift re-validation — Athena storage context', () => {
    function makeAthenaComposerWithValidationError(validationError: Error) {
      // blendedReportDataService.resolveBlendingDecision is the single chokepoint
      // where schema drift is surfaced (upstream validator runs inside it).
      // We stub it to throw a pre-built BadRequestException exactly as the real
      // OutputControlsValidatorService would.
      const blendedReportDataService = {
        resolveBlendingDecision: jest.fn().mockRejectedValue(validationError),
      };
      const queryBuilderFacade = { buildQuery: jest.fn() };
      const tableReferenceService = { resolveTableName: jest.fn() };
      const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
      const blendableSchemaService = { computeBlendableSchema: jest.fn() };

      return new ReportSqlComposerService(
        blendedReportDataService as never,
        queryBuilderFacade as never,
        tableReferenceService as never,
        capabilityService as never,
        blendableSchemaService as never
      );
    }

    const athenaReport = (filterConfig: object[]) =>
      ({
        id: 'rep-athena',
        filterConfig,
        sortConfig: null,
        limitConfig: null,
        dataMart: {
          id: 'dm-athena',
          projectId: 'proj-a',
          storage: { type: DataStorageType.AWS_ATHENA },
          definition: { fullyQualifiedName: 'mydb.myschema.orders' },
        },
      }) as never;

    it('filter on a column no longer in the schema (renamed/excluded) surfaces as 400 BusinessViolationException with unknownColumns', async () => {
      // Simulates: report was saved with a filter on "old_column"; the data mart
      // schema was later updated and "old_column" was renamed / excluded.  The
      // validator running inside resolveBlendingDecision raises the same structured
      // 400 used for disconnected selected columns.
      const schemaDriftError = new BusinessViolationException(
        'Cannot build report SQL. Disconnected columns: "old_column". They are missing from the current Data Mart output schema. Uncheck them to remove them from the report, or contact your analyst to restore the schema.',
        { unknownColumns: ['old_column'], dataMartId: 'dm-athena' }
      );
      const service = makeAthenaComposerWithValidationError(schemaDriftError);

      const report = athenaReport([{ column: 'old_column', operator: 'eq', value: 'stale' }]);

      // Must re-throw the BusinessViolationException (mapped to HTTP 400), not a generic Error (500).
      await expect(service.compose(report, { userId: 'u1', roles: ['viewer'] })).rejects.toThrow(
        BusinessViolationException
      );
      await expect(
        service.compose(report, { userId: 'u1', roles: ['viewer'] })
      ).rejects.toMatchObject({
        errorDetails: {
          unknownColumns: ['old_column'],
          dataMartId: 'dm-athena',
        },
      });
    });

    it('operator now invalid for the column type after schema type change surfaces as 400 with INVALID_OPERATOR_FOR_TYPE', async () => {
      // Simulates: "created_at" was VARCHAR (operator "contains" valid), but
      // the schema was altered to TIMESTAMP — "contains" is no longer valid.
      const typeChangedError = new BadRequestException({
        message: 'Output controls validation failed',
        details: {
          errors: [
            {
              code: 'INVALID_OPERATOR_FOR_TYPE',
              column: 'created_at',
              type: 'TIMESTAMP',
              operator: 'contains',
            },
          ],
        },
      });
      const service = makeAthenaComposerWithValidationError(typeChangedError);

      const report = athenaReport([{ column: 'created_at', operator: 'contains', value: '2024' }]);

      await expect(service.compose(report, { userId: 'u1', roles: ['viewer'] })).rejects.toThrow(
        BadRequestException
      );
      await expect(
        service.compose(report, { userId: 'u1', roles: ['viewer'] })
      ).rejects.toMatchObject({
        response: {
          details: {
            errors: [
              expect.objectContaining({
                code: 'INVALID_OPERATOR_FOR_TYPE',
                column: 'created_at',
                operator: 'contains',
              }),
            ],
          },
        },
      });
    });

    it('queryBuilderFacade is never called when schema-drift validation fails', async () => {
      const schemaDriftError = new BusinessViolationException(
        'Cannot build report SQL. Disconnected columns: "stale". They are missing from the current Data Mart output schema. Uncheck them to remove them from the report, or contact your analyst to restore the schema.',
        { unknownColumns: ['stale'], dataMartId: 'dm-athena' }
      );
      const blendedReportDataService = {
        resolveBlendingDecision: jest.fn().mockRejectedValue(schemaDriftError),
      };
      const queryBuilderFacade = { buildQuery: jest.fn() };
      const tableReferenceService = { resolveTableName: jest.fn() };
      const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
      const blendableSchemaService = { computeBlendableSchema: jest.fn() };

      const service = new ReportSqlComposerService(
        blendedReportDataService as never,
        queryBuilderFacade as never,
        tableReferenceService as never,
        capabilityService as never,
        blendableSchemaService as never
      );

      await expect(
        service.compose(athenaReport([{ column: 'stale', operator: 'eq', value: 'x' }]), {
          userId: 'u1',
          roles: ['viewer'],
        })
      ).rejects.toThrow(BusinessViolationException);

      expect(queryBuilderFacade.buildQuery).not.toHaveBeenCalled();
    });
  });

  // E2E SQL + parameter binding for non-blended Athena report
  //
  // Mirrors the BQ E2E suite but uses the real AthenaQueryBuilder + AthenaClauseRenderer
  // to assert positional ? placeholders, double-quote identifiers, and strpos-based
  // substring matching on an AWS_ATHENA-typed data mart.
  describe('E2E SQL + parameter binding for non-blended Athena report', () => {
    function makeAthenaComposer(columnFilter = ['name', 'amount']) {
      const realBuilder = new AthenaQueryBuilder(new AthenaClauseRenderer());
      const facade = {
        buildQuery: (
          _type: unknown,
          definition: Parameters<AthenaQueryBuilder['buildQuery']>[0],
          options: Parameters<AthenaQueryBuilder['buildQuery']>[1]
        ) => realBuilder.buildQuery(definition, options),
      };
      const blendedDataService = {
        resolveBlendingDecision: jest
          .fn()
          .mockResolvedValue({ needsBlending: false, columnFilter }),
      };
      const tableReferenceService = {
        resolveTableName: jest.fn().mockResolvedValue('"mydb"."myschema"."orders"'),
      };
      const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
      const blendableSchemaService = { computeBlendableSchema: jest.fn() };

      return new ReportSqlComposerService(
        blendedDataService as never,
        facade as never,
        tableReferenceService as never,
        capabilityService as never,
        blendableSchemaService as never
      );
    }

    it('parameterizes scalar filter values with positional ? and double-quote identifiers', async () => {
      const composer = makeAthenaComposer();
      const report = {
        filterConfig: [
          { column: 'name', operator: 'eq', value: 'Alice' },
          { column: 'amount', operator: 'gte', value: 50 },
        ],
        sortConfig: [{ column: 'amount', direction: 'desc' }],
        limitConfig: 100,
        dataMart: {
          id: 'dm-a',
          projectId: 'proj-a',
          storage: { type: DataStorageType.AWS_ATHENA },
          definition: { fullyQualifiedName: 'mydb.myschema.orders' },
        },
      } as never;

      const result = await composer.compose(report, { userId: 'u1', roles: ['viewer'] });

      expect(result.sql).toContain('SELECT\n  "name",\n  "amount"');
      expect(result.sql).toContain('FROM "mydb"."myschema"."orders"');
      // Athena uses positional ? (not named @p0)
      expect(result.sql).toContain('WHERE "name" = ?\n  AND "amount" >= ?');
      expect(result.sql).toContain('ORDER BY\n  "amount" DESC');
      expect(result.sql).toContain('LIMIT 100');
      expect(result.params).toEqual([
        { name: 'p0', value: 'Alice' },
        { name: 'p1', value: 50 },
      ]);
      // No raw user values interpolated into the SQL
      expect(result.sql).not.toContain("'Alice'");
      expect(result.sql).not.toContain('"Alice"');
    });

    it('uses strpos for substring matching (no LIKE wildcards)', async () => {
      const composer = makeAthenaComposer(['name']);
      const report = {
        filterConfig: [{ column: 'name', operator: 'contains', value: '100%' }],
        sortConfig: null,
        limitConfig: null,
        dataMart: {
          id: 'dm-a',
          projectId: 'proj-a',
          storage: { type: DataStorageType.AWS_ATHENA },
          definition: { fullyQualifiedName: 'mydb.myschema.orders' },
        },
      } as never;

      const result = await composer.compose(report, { userId: 'u1', roles: ['viewer'] });

      expect(result.sql).toContain('strpos("name", ?) > 0');
      expect(result.sql).not.toMatch(/LIKE/);
      expect(result.params).toEqual([{ name: 'p0', value: '100%' }]);
    });

    // composeStatic() must emit runnable, param-free SQL for paths with no binding
    // channel (copied data-mart definition, generated-SQL preview).
    it('composeStatic inlines positional ? into literals for Athena', async () => {
      const composer = makeAthenaComposer(['name', 'amount']);
      const report = {
        filterConfig: [
          { column: 'name', operator: 'eq', value: "O'Brien" },
          { column: 'amount', operator: 'gte', value: 50 },
        ],
        sortConfig: null,
        limitConfig: null,
        dataMart: {
          id: 'dm-a',
          projectId: 'proj-a',
          storage: { type: DataStorageType.AWS_ATHENA },
          definition: { fullyQualifiedName: 'mydb.myschema.orders' },
        },
      } as never;

      const { sql } = await composer.composeStatic(report, { userId: 'u1', roles: ['viewer'] });

      // No unbound placeholders survive; values are inlined (quotes escaped).
      expect(sql).not.toContain('?');
      expect(sql).toContain(`WHERE "name" = 'O''Brien'\n  AND "amount" >= 50`);
    });
  });

  describe('inlineStaticSql', () => {
    const composer = new ReportSqlComposerService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    it('returns SQL unchanged when there are no params', () => {
      expect(composer.inlineStaticSql(DataStorageType.AWS_ATHENA, 'SELECT 1')).toBe('SELECT 1');
      expect(composer.inlineStaticSql(DataStorageType.GOOGLE_BIGQUERY, 'SELECT 1', [])).toBe(
        'SELECT 1'
      );
    });

    it('inlines positional ? to literals for Athena (quotes escaped)', () => {
      const sql = composer.inlineStaticSql(
        DataStorageType.AWS_ATHENA,
        `SELECT * FROM t WHERE "name" = ? AND "amount" >= ?`,
        [
          { name: 'p0', value: "O'Brien" },
          { name: 'p1', value: 50 },
        ]
      );
      expect(sql).not.toContain('?');
      expect(sql).toContain(`"name" = 'O''Brien'`);
      expect(sql).toContain('"amount" >= 50');
    });

    it('inlines named @p to literals for BigQuery and Legacy BigQuery', () => {
      const sql = 'SELECT * FROM t WHERE `d` = CAST(@p0 AS DATE)';
      const params = [{ name: 'p0', value: '2024-01-01' }];
      const bq = composer.inlineStaticSql(DataStorageType.GOOGLE_BIGQUERY, sql, params);
      const legacy = composer.inlineStaticSql(DataStorageType.LEGACY_GOOGLE_BIGQUERY, sql, params);
      expect(bq).toBe("SELECT * FROM t WHERE `d` = CAST('2024-01-01' AS DATE)");
      expect(legacy).toBe(bq);
    });

    it('throws BusinessViolationException for a dialect with no inliner when params are present', () => {
      expect(() =>
        composer.inlineStaticSql(DataStorageType.SNOWFLAKE, 'SELECT * FROM t WHERE a = ?', [
          { name: 'p0', value: 1 },
        ])
      ).toThrow(BusinessViolationException);
    });
  });

  describe('composeStatic — non-Athena dialects', () => {
    it('inlines named @params into literals for BigQuery (CAST wrapper makes date literals valid)', async () => {
      const queryBuilderFacade = {
        buildQuery: jest.fn().mockResolvedValue({
          sql: 'SELECT * FROM t WHERE `name` = @p0 AND `d` = CAST(@p1 AS DATE)',
          params: [
            { name: 'p0', value: "O'Brien" },
            { name: 'p1', value: '2024-01-01' },
          ],
        }),
      };
      const blendedDataService = {
        resolveBlendingDecision: jest
          .fn()
          .mockResolvedValue({ needsBlending: false, columnFilter: ['name', 'd'] }),
      };
      const tableReferenceService = { resolveTableName: jest.fn().mockResolvedValue('p.d.t') };
      const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
      const blendableSchemaService = { computeBlendableSchema: jest.fn() };
      const composer = new ReportSqlComposerService(
        blendedDataService as never,
        queryBuilderFacade as never,
        tableReferenceService as never,
        capabilityService as never,
        blendableSchemaService as never
      );
      const report = {
        filterConfig: [{ column: 'name', operator: 'eq', value: "O'Brien" }],
        dataMart: {
          id: 'm',
          projectId: 'p',
          storage: { type: 'GOOGLE_BIGQUERY' },
          definition: { type: 'table', fullyQualifiedName: 'p.d.t' },
        },
      } as never;

      const { sql } = await composer.composeStatic(report, { userId: 'u1', roles: ['admin'] });
      expect(sql).not.toContain('@p');
      expect(sql).toBe(
        "SELECT * FROM t WHERE `name` = 'O\\'Brien' AND `d` = CAST('2024-01-01' AS DATE)"
      );
    });

    it('inlines named @params into literals for Legacy BigQuery (shares the BigQuery branch)', async () => {
      const queryBuilderFacade = {
        buildQuery: jest.fn().mockResolvedValue({
          sql: 'SELECT * FROM t WHERE `d` = CAST(@p0 AS DATE)',
          params: [{ name: 'p0', value: '2024-01-01' }],
        }),
      };
      const blendedDataService = {
        resolveBlendingDecision: jest
          .fn()
          .mockResolvedValue({ needsBlending: false, columnFilter: ['d'] }),
      };
      const composer = new ReportSqlComposerService(
        blendedDataService as never,
        queryBuilderFacade as never,
        { resolveTableName: jest.fn().mockResolvedValue('p.d.t') } as never,
        { isSupported: jest.fn().mockReturnValue(true) } as never,
        { computeBlendableSchema: jest.fn() } as never
      );
      const report = {
        filterConfig: [{ column: 'd', operator: 'gte', value: '2024-01-01' }],
        dataMart: {
          id: 'm',
          projectId: 'p',
          storage: { type: DataStorageType.LEGACY_GOOGLE_BIGQUERY },
          definition: { type: 'sql', sqlQuery: 'SELECT * FROM t' },
        },
      } as never;

      const { sql } = await composer.composeStatic(report, { userId: 'u1', roles: ['admin'] });
      expect(sql).not.toContain('@p');
      expect(sql).toBe("SELECT * FROM t WHERE `d` = CAST('2024-01-01' AS DATE)");
    });

    it('returns SQL unchanged when there are no params (sort/limit-only or no controls)', async () => {
      const queryBuilderFacade = { buildQuery: jest.fn().mockResolvedValue('SELECT * FROM t') };
      const blendedDataService = {
        resolveBlendingDecision: jest
          .fn()
          .mockResolvedValue({ needsBlending: false, columnFilter: ['a'] }),
      };
      const composer = new ReportSqlComposerService(
        blendedDataService as never,
        queryBuilderFacade as never,
        { resolveTableName: jest.fn() } as never,
        { isSupported: jest.fn().mockReturnValue(true) } as never,
        { computeBlendableSchema: jest.fn() } as never
      );
      const report = {
        dataMart: {
          id: 'm',
          projectId: 'p',
          storage: { type: DataStorageType.AWS_ATHENA },
          definition: { type: 'table', fullyQualifiedName: 'p.d.t' },
        },
      } as never;

      const { sql } = await composer.composeStatic(report, { userId: 'u1', roles: ['admin'] });
      expect(sql).toBe('SELECT * FROM t');
    });
  });
});
