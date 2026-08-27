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
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { BlendedReportDataService } from './blended-report-data.service';
import { OutputControlsValidatorService } from './output-controls-validator.service';
import { OutputControlsCapabilityService } from './output-controls-capability.service';
import { BigQueryBlendedQueryBuilder } from '../data-storage-types/bigquery/services/bigquery-blended-query-builder';
import { createFormulaFunctionDialectRegistry } from '../calculated-fields/formula-function-dialect';

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
    decision: {
      needsBlending: boolean;
      blendedSql?: string;
      columnFilter?: string[];
      blendedDataHeaders?: ReportDataHeader[];
    },
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
      blendableSchemaService as never,
      // The composer validates the REPORT's own config before deriving a Totals restriction from
      // its HAVING rules (that precondition used to hold by call order alone).
      { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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
      undefined,
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

  it('returns the decision blended headers so a caller need not resolve the decision twice', async () => {
    const joinedHeader = new ReportDataHeader('partner__cost', 'partner Cost');
    const { service } = createService({
      needsBlending: true,
      blendedSql: 'SELECT blended FROM cte',
      blendedDataHeaders: [joinedHeader],
    });

    const result = await service.compose(buildReport(), { userId: 'user-1', roles: ['admin'] });

    expect(result.blendedDataHeaders).toEqual([joinedHeader]);
  });

  it('has no blended headers on the non-blended path', async () => {
    const { service } = createService({ needsBlending: false, columnFilter: ['a'] }, 'SELECT a');

    const result = await service.compose(buildReport(), { userId: 'user-1', roles: ['admin'] });

    expect(result.blendedDataHeaders).toBeUndefined();
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
      blendableSchemaService as never,
      // The composer validates the REPORT's own config before deriving a Totals restriction from
      // its HAVING rules (that precondition used to hold by call order alone).
      { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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
        // Forwarded with the clause the composer decided for it — the builders read
        // that verdict and never re-derive one from `rule.function`.
        filters: [{ ...filterConfig[0], clause: 'where' }],
        sort: sortConfig,
        limit: 10,
        mainTableReference: 'p.d.view_x',
      })
    );
    expect(result).toEqual({
      sql: 'SELECT 1',
      params: [{ name: 'p0', value: 1 }],
      needsBlending: false,
      primaryKeyColumns: [],
    });
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
      blendableSchemaService as never,
      // The composer validates the REPORT's own config before deriving a Totals restriction from
      // its HAVING rules (that precondition used to hold by call order alone).
      { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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
      blendableSchemaService as never,
      // The composer validates the REPORT's own config before deriving a Totals restriction from
      // its HAVING rules (that precondition used to hold by call order alone).
      { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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
    expect(result).toEqual({
      sql: 'SELECT * FROM t',
      needsBlending: false,
      primaryKeyColumns: [],
    });
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
      { computeBlendableSchema: jest.fn() } as never,
      // The composer validates the REPORT's own config before deriving a Totals restriction from
      // its HAVING rules (that precondition used to hold by call order alone).
      { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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
      needsBlending: true,
      primaryKeyColumns: undefined,
      uniqueCountSources: undefined,
    });
  });

  it('surfaces the decision joined Unique Count sources so header resolution can follow the SQL (#6792)', async () => {
    const ordersSource = {
      aliasPath: 'orders',
      cteName: 'orders_chain',
      pkColumns: ['order_id'],
      outputLabel: 'orders__unique_count',
      displayLabel: 'Orders Unique Count',
    };
    const blendedDataService = {
      resolveBlendingDecision: jest.fn().mockResolvedValue({
        needsBlending: true,
        blendedSql: 'WITH ... SELECT ...',
        columnFilter: ['customer_email'],
        primaryKeyColumns: ['id'],
        uniqueCountSources: [ordersSource],
      }),
    };
    const composer = new ReportSqlComposerService(
      blendedDataService as never,
      {} as never,
      {} as never,
      { isSupported: jest.fn() } as never,
      { computeBlendableSchema: jest.fn() } as never,
      { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
    );

    const result = await composer.compose(
      {
        columnConfig: ['customer_email'],
        uniqueCountConfig: ['orders'],
        dataMart: { id: 'm', projectId: 'p', storage: { type: 'GOOGLE_BIGQUERY' } },
      } as never,
      { userId: 'user-1', roles: ['admin'] }
    );

    expect(result.uniqueCountSources).toEqual([ordersSource]);
    expect(result.primaryKeyColumns).toEqual(['id']);
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

  it('throws BLANK_FILTER_COLUMN_TYPE_UNRESOLVED when a blank filter runs with no schema types', async () => {
    // With no actualized schema there is no column type to branch on, and the
    // renderer would silently degrade a string is_blank to the NULL-only form —
    // wrong rows instead of an error (#6779). The composer refuses instead.
    const { service, queryBuilderFacade } = createService({
      needsBlending: false,
      columnFilter: ['name'],
    });
    const report = buildReport({
      columnConfig: ['name'],
      filterConfig: [{ column: 'name', operator: 'is_blank' }],
    } as never);
    await expect(
      service.compose(report, { userId: 'user-1', roles: ['admin'] })
    ).rejects.toMatchObject({
      response: {
        details: {
          errors: [{ code: 'BLANK_FILTER_COLUMN_TYPE_UNRESOLVED', column: 'name' }],
        },
      },
    });
    expect(queryBuilderFacade.buildQuery).not.toHaveBeenCalled();
  });

  it('throws BLANK_FILTER_COLUMN_TYPE_UNRESOLVED when every schema field is hidden (non-empty schema, empty type map)', async () => {
    // schemaFields.length > 0 but collectSchemaFieldPathTypes drops hidden fields, so
    // the type map is empty — a map-existence-only guard would let a string is_blank
    // silently render as bare IS NULL. The guard must resolve each blank column.
    const { service, queryBuilderFacade } = createService({
      needsBlending: false,
      columnFilter: ['name'],
    });
    const report = buildReport({
      dataMart: {
        id: 'dm-1',
        definition: { sqlQuery: 'SELECT 1' },
        storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY' },
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            { name: 'name', type: 'STRING', status: 'CONNECTED', isHiddenForReporting: true },
          ],
        },
      },
      columnConfig: ['name'],
      filterConfig: [{ column: 'name', operator: 'is_blank' }],
    } as never);
    await expect(
      service.compose(report, { userId: 'user-1', roles: ['admin'] })
    ).rejects.toMatchObject({
      response: {
        details: {
          errors: [{ code: 'BLANK_FILTER_COLUMN_TYPE_UNRESOLVED', column: 'name' }],
        },
      },
    });
    expect(queryBuilderFacade.buildQuery).not.toHaveBeenCalled();
  });

  it('legacy is_null composes without an actualized schema — it needs no column type', async () => {
    const { service, queryBuilderFacade } = createService(
      { needsBlending: false, columnFilter: ['name'] },
      'SELECT 1'
    );
    const report = buildReport({
      columnConfig: ['name'],
      filterConfig: [{ column: 'name', operator: 'is_null' }],
    } as never);
    await expect(
      service.compose(report, { userId: 'user-1', roles: ['admin'] })
    ).resolves.toBeDefined();
    expect(queryBuilderFacade.buildQuery).toHaveBeenCalled();
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
        blendableSchemaService as never,
        // The composer validates the REPORT's own config before deriving a Totals restriction from
        // its HAVING rules (that precondition used to hold by call order alone).
        { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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
        blendableSchemaService as never,
        // The composer validates the REPORT's own config before deriving a Totals restriction from
        // its HAVING rules (that precondition used to hold by call order alone).
        { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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
        blendableSchemaService as never,
        // The composer validates the REPORT's own config before deriving a Totals restriction from
        // its HAVING rules (that precondition used to hold by call order alone).
        { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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
        blendableSchemaService as never,
        // The composer validates the REPORT's own config before deriving a Totals restriction from
        // its HAVING rules (that precondition used to hold by call order alone).
        { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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
      {} as never,
      // The composer validates the REPORT's own config before deriving a Totals restriction from
      // its HAVING rules (that precondition used to hold by call order alone).
      { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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
        blendableSchemaService as never,
        // The composer validates the REPORT's own config before deriving a Totals restriction from
        // its HAVING rules (that precondition used to hold by call order alone).
        { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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
        { computeBlendableSchema: jest.fn() } as never,
        // The composer validates the REPORT's own config before deriving a Totals restriction from
        // its HAVING rules (that precondition used to hold by call order alone).
        { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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
        { computeBlendableSchema: jest.fn() } as never,
        // The composer validates the REPORT's own config before deriving a Totals restriction from
        // its HAVING rules (that precondition used to hold by call order alone).
        { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
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

  // E2E: wires the *real* BigQueryQueryBuilder + BigQueryClauseRenderer behind a stub facade
  // (mirrors the "E2E SQL + parameter binding" suites above) to prove a main-owner calculated
  // metric reaches actual generated SQL, not just a mocked options object.
  describe('calculated fields — main-owner', () => {
    const CTR_FORMULA = 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
    const HIDDEN_RATIO_FORMULA =
      'SUM({{ref field="internal_clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';

    const dataMartWithCtr = {
      id: 'dm-ctr',
      projectId: 'proj-ctr',
      storage: { type: 'GOOGLE_BIGQUERY' },
      definition: { type: 'table', fullyQualifiedName: 'proj.ds.tbl' },
      schema: {
        fields: [
          { name: 'clicks', type: 'INTEGER', status: 'CONNECTED' },
          { name: 'impressions', type: 'INTEGER', status: 'CONNECTED' },
          { name: 'country', type: 'STRING', status: 'CONNECTED' },
          { name: 'revenue', type: 'FLOAT', status: 'CONNECTED' },
          { name: 'date', type: 'DATE', status: 'CONNECTED' },
          {
            name: 'internal_clicks',
            type: 'INTEGER',
            status: 'CONNECTED',
            isHiddenForReporting: true,
          },
          {
            name: 'ctr',
            type: 'FLOAT',
            status: 'CONNECTED',
            alias: 'CTR, %',
            description: 'Clicks per impression.',
            calculated: { formula: CTR_FORMULA, level: 'metric' },
          },
          {
            name: 'hidden_ratio',
            type: 'FLOAT',
            status: 'CONNECTED',
            calculated: { formula: HIDDEN_RATIO_FORMULA, level: 'metric' },
          },
        ],
      },
    } as never;

    function makeComposer(columnFilter: string[]) {
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
          .mockResolvedValue({ needsBlending: false, columnFilter }),
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
        blendableSchemaService as never,
        { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
      );
    }

    it('composes an aggregated query when a calculated field is selected without any aggregation', async () => {
      const composer = makeComposer(['clicks', 'ctr']);
      const report = { columnConfig: ['clicks', 'ctr'], dataMart: dataMartWithCtr } as never;

      const { sql } = await composer.compose(report, { userId: 'u1', roles: ['admin'] });

      expect(sql).toContain('GROUP BY');
      expect(sql).toMatch(/GROUP BY\s+`clicks`/);
      expect(sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
      // The metric's own name must never reach the projection as a bare, unqualified source
      // column — its only appearance in the SQL is the alias on its own computed expression.
      expect((sql.match(/`ctr`/g) ?? []).length).toBe(1);
    });

    // The end-to-end proof that `renderHaving`'s named throw is unreachable
    // from a report: `compose` builds the predicate plan from the FILTER's own columns, so the
    // rule and the plan come from one schema list and cannot disagree about which fields exist.
    // The field is deliberately NOT selected — the shape the projection channel cannot reach.
    it('composes a HAVING over the formula for a filter on a metric the report does not select', async () => {
      const composer = makeComposer(['country']);
      const report = {
        columnConfig: ['country'],
        filterConfig: [{ column: 'ctr', operator: 'gt', value: 0.5 }],
        dataMart: dataMartWithCtr,
      } as never;

      const { sql } = await composer.compose(report, { userId: 'u1', roles: ['admin'] });

      expect(sql).toMatch(/GROUP BY\s+`country`/);
      // Both sides carry the field's DECLARED type, composed end to end: the
      // VALUE's half appears only because the schema field's type reaches the builder's type
      // resolver, which is the whole path a report takes.
      expect(sql).toContain(
        'HAVING CAST((SUM(src.`clicks`) / NULLIF(SUM(src.`impressions`), 0)) AS FLOAT64) > ' +
          'CAST(@h0 AS FLOAT64)'
      );
      // Filtered, not selected: nothing named `ctr` reaches the SQL at all.
      expect(sql).not.toContain('`ctr`');
    });

    it('composes correctly alongside a real aggregation on another column', async () => {
      const composer = makeComposer(['country', 'revenue', 'ctr']);
      const report = {
        columnConfig: ['country', 'revenue', 'ctr'],
        aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        dataMart: dataMartWithCtr,
      } as never;

      const { sql } = await composer.compose(report, { userId: 'u1', roles: ['admin'] });

      expect(sql).toContain('SUM(`revenue`) AS `revenue | SUM`');
      expect(sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
      // 'revenue' is its own aggregated metric, not a grouping key — only 'country' groups.
      expect(sql).toMatch(/GROUP BY\s+`country`/);
      expect(sql).not.toMatch(/GROUP BY[^]*`revenue`/);
    });

    it('composes correctly alongside a date-trunc dimension', async () => {
      const composer = makeComposer(['date', 'ctr']);
      const report = {
        columnConfig: ['date', 'ctr'],
        dateTruncConfig: [{ column: 'date', unit: 'MONTH' }],
        dataMart: dataMartWithCtr,
      } as never;

      const { sql } = await composer.compose(report, { userId: 'u1', roles: ['admin'] });

      expect(sql).toContain('AS `date`');
      expect(sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
      expect(sql).toContain('GROUP BY');
      expect((sql.match(/`ctr`/g) ?? []).length).toBe(1);
    });

    it('composes correctly when the formula references a field the reporting menu hides', async () => {
      const composer = makeComposer(['country', 'hidden_ratio']);
      const report = {
        columnConfig: ['country', 'hidden_ratio'],
        dataMart: dataMartWithCtr,
      } as never;

      const { sql } = await composer.compose(report, { userId: 'u1', roles: ['admin'] });

      // isHiddenForReporting only takes a column off the reporting menu; the formula still
      // reads its real warehouse column.
      expect(sql).toContain(
        'SUM(`internal_clicks`) / NULLIF(SUM(`impressions`), 0) AS `hidden_ratio`'
      );
      expect(sql).toMatch(/GROUP BY\s+`country`/);
    });

    it('composes a single grand-total row when only the calculated field is selected', async () => {
      const composer = makeComposer(['ctr']);
      const report = { columnConfig: ['ctr'], dataMart: dataMartWithCtr } as never;

      const { sql } = await composer.compose(report, { userId: 'u1', roles: ['admin'] });

      expect(sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
      expect(sql).not.toContain('GROUP BY');
    });

    // The changeset promises a metric can be SELECTED and SORTED BY, so the
    // sort has to actually render. It resolves through `buildAggregatedAliasResolver`'s fallback
    // to the plain quoted name, which is the metric's own SELECT alias: legal in ORDER BY on every
    // supported dialect, and the only spelling that could work (there is no column behind it).
    // The metric's name is an output alias, never a warehouse column — but a FLOAT declaration
    // also makes its sort a COMPARISON, so the declared type reaches ORDER BY the same way it
    // reaches a filter, extended to the sort. Ordering the bare alias sorted the formula's
    // text; under a LIMIT that returns a different ROW SET, measured on four dialects.
    it('renders ORDER BY on the calculated field as its cast expression', async () => {
      const composer = makeComposer(['country', 'ctr']);
      const report = {
        columnConfig: ['country', 'ctr'],
        sortConfig: [{ column: 'ctr', direction: 'desc' }],
        dataMart: dataMartWithCtr,
      } as never;

      const { sql } = await composer.compose(report, { userId: 'u1', roles: ['admin'] });

      expect(sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
      // Qualified `src.` where the projection beside it is bare, and deliberately so: the sort is
      // rendered from the PREDICATE map, so a field that is both filtered and sorted carries one
      // string in both clauses. BigQuery is the only dialect that qualifies predicates at all.
      expect(sql).toContain(
        'ORDER BY\n  CAST((SUM(src.`clicks`) / NULLIF(SUM(src.`impressions`), 0)) AS FLOAT64) DESC'
      );
      expect(sql).not.toContain('ORDER BY\n  `ctr` DESC');
    });

    // The plan is the metric's ONLY header source (no native column, no aggregation rule), so the
    // analyst's own label has to travel on it — otherwise `ctr` is the single column in its own
    // report whose Sheets/Looker/MCP/HTTP-Data header ignores the alias every other field shows.
    it("carries the metric's alias and description on the plan", async () => {
      const composer = makeComposer(['country', 'ctr']);
      const report = { columnConfig: ['country', 'ctr'], dataMart: dataMartWithCtr } as never;

      const { calculatedFields } = await composer.compose(report, {
        userId: 'u1',
        roles: ['admin'],
      });

      expect(calculatedFields).toEqual([
        {
          outputName: 'ctr',
          type: 'FLOAT',
          formula: CTR_FORMULA,
          level: 'metric',
          alias: 'CTR, %',
          description: 'Clicks per impression.',
        },
      ]);
    });

    it('leaves alias/description undefined for a metric that declares neither', async () => {
      const composer = makeComposer(['country', 'hidden_ratio']);
      const report = {
        columnConfig: ['country', 'hidden_ratio'],
        dataMart: dataMartWithCtr,
      } as never;

      const { calculatedFields } = await composer.compose(report, {
        userId: 'u1',
        roles: ['admin'],
      });

      expect(calculatedFields![0].alias).toBeUndefined();
      expect(calculatedFields![0].description).toBeUndefined();
    });

    // `roas = revenue / cost` over two aggregate-level Calculated Fields — the headline
    // formula of the feature, composed end to end through the real BigQuery builder.
    describe('a formula referencing another formula', () => {
      const REVENUE_FORMULA = 'SUM({{ref field="amount"}})';
      const COST_FORMULA = 'SUM({{ref field="spend"}})';
      const ROAS_FORMULA = '{{ref field="net_revenue"}} / NULLIF({{ref field="media_cost"}}, 0)';
      const dataMartWithRoas = {
        ...(dataMartWithCtr as object),
        schema: {
          fields: [
            { name: 'amount', type: 'FLOAT', status: 'CONNECTED' },
            { name: 'spend', type: 'FLOAT', status: 'CONNECTED' },
            { name: 'country', type: 'STRING', status: 'CONNECTED' },
            {
              name: 'net_revenue',
              type: 'FLOAT',
              status: 'CONNECTED',
              calculated: { formula: REVENUE_FORMULA, level: 'metric' },
            },
            {
              name: 'media_cost',
              type: 'FLOAT',
              status: 'CONNECTED',
              calculated: { formula: COST_FORMULA, level: 'metric' },
            },
            {
              name: 'roas',
              type: 'FLOAT',
              status: 'CONNECTED',
              // STALE: `roas` was saved while its two dependencies were row-level, and a
              // schema write that skips the validator left this cache behind. The composer must
              // re-derive 'metric' from the chain — read as written, the report below groups by
              // `roas`'s own expression and collapses to a single silently wrong row.
              calculated: { formula: ROAS_FORMULA, level: 'column' },
            },
          ],
        },
      } as never;

      it('substitutes both referenced formulas and keeps the metric out of GROUP BY', async () => {
        const composer = makeComposer(['country', 'roas']);
        const report = { columnConfig: ['country', 'roas'], dataMart: dataMartWithRoas } as never;

        const { sql } = await composer.compose(report, { userId: 'u1', roles: ['admin'] });

        expect(sql).toContain('(SUM(`amount`)) / NULLIF((SUM(`spend`)), 0) AS `roas`');
        expect(sql).toMatch(/GROUP BY\s+`country`/);
        expect(sql).not.toMatch(/GROUP BY[^]*roas/);
      });

      // The dependencies enter the plan to be SUBSTITUTED, never to be projected — a report
      // asking for `roas` must not silently gain two more columns in its Sheet, its Looker Studio
      // field list and its MCP result.
      it('projects only the selected metric, never the formulas it reads', async () => {
        const composer = makeComposer(['country', 'roas']);
        const report = { columnConfig: ['country', 'roas'], dataMart: dataMartWithRoas } as never;

        const { sql, calculatedFields } = await composer.compose(report, {
          userId: 'u1',
          roles: ['admin'],
        });

        expect(calculatedFields!.map(m => m.outputName)).toEqual(['roas']);
        expect(sql).not.toContain('AS `net_revenue`');
        expect(sql).not.toContain('AS `media_cost`');
      });

      // The Totals eligibility gate asks the SAME seat the GROUP BY does. Reading the persisted
      // level here instead skips `roas` as if it were a row-level dimension: silently absent from
      // Totals, while the report's own SQL computes it as the metric it is. Kills
      // "isRowLevelCalculatedField(descriptor.field)".
      it('totals a metric whose aggregation lives in the formulas it reads', async () => {
        const composer = makeComposer(['country', 'roas']);
        const report = { columnConfig: ['country', 'roas'], dataMart: dataMartWithRoas } as never;

        const totals = await composer.composeTotals(report, { userId: 'u1', roles: ['admin'] });

        expect(totals!.calculatedFields?.map(m => m.outputName)).toEqual(['roas']);
        // Already an aggregate — never given a SUM/AVG/MIN/MAX of its own making.
        expect(totals!.aggregations).toEqual([]);
        expect(totals!.sql).toContain('(SUM(`amount`)) / NULLIF((SUM(`spend`)), 0) AS `roas`');
      });

      // A wildcard (no explicit projection) composes no calculated field at all —
      // so a dependency cannot arrive through one either.
      it('does not compose a dependency for a report with no explicit projection', async () => {
        const composer = makeComposer([]);
        const report = { columnConfig: null, dataMart: dataMartWithRoas } as never;

        const { calculatedFields } = await composer.compose(report, {
          userId: 'u1',
          roles: ['admin'],
        });

        expect(calculatedFields).toBeUndefined();
      });
    });

    describe('composeTotals — deriveTotalsAggregations excludes the metric from summarization', () => {
      it('keeps the metric in totals columns but never invents a SUM/AVG/MIN/MAX rule for it', async () => {
        const composer = makeComposer(['revenue', 'ctr']);
        const report = {
          columnConfig: ['revenue', 'ctr'],
          dataMart: dataMartWithCtr,
        } as never;

        const totals = await composer.composeTotals(report, { userId: 'u1', roles: ['admin'] });

        expect(totals).not.toBeNull();
        // The metric is NOT an ordinary summarizable column — already an aggregate —
        // so it must never gain a stray SUM/AVG/MIN/MAX rule; 'revenue' still gets its normal set.
        expect(totals!.aggregations.some(a => a.column === 'ctr')).toBe(false);
        expect(totals!.aggregations.some(a => a.column === 'revenue')).toBe(true);
        // It IS still a projected totals column — carried through its own calculatedFields
        // channel, exactly like the main report.
        expect(totals!.columns).toContain('ctr');
        expect(totals!.calculatedFields).toEqual([
          expect.objectContaining({ outputName: 'ctr', formula: CTR_FORMULA }),
        ]);
        // The SQL renders the metric's own formula exactly once — never wrapped in AVG/MIN/MAX.
        expect(totals!.sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
        expect((totals!.sql.match(/`ctr`/g) ?? []).length).toBe(1);
      });

      it('excludes the metric from the legacy no-columnConfig fallback', async () => {
        const composer = makeComposer(['clicks', 'impressions', 'country', 'revenue', 'date']);
        // A legacy report predating both aggregations and columnConfig: null selection means
        // "every native column" — but never a calculated field, which is composed only when
        // asked for by name (same rule HttpDataColumnResolver's implicit-all resolution follows).
        const report = { columnConfig: null, dataMart: dataMartWithCtr } as never;

        const totals = await composer.composeTotals(report, { userId: 'u1', roles: ['admin'] });

        expect(totals).not.toBeNull();
        expect(totals!.columns).not.toContain('ctr');
        expect(totals!.columns).not.toContain('hidden_ratio');
        expect(totals!.aggregations.some(a => a.column === 'ctr')).toBe(false);
        expect(totals!.calculatedFields ?? []).toEqual([]);
      });
    });

    function makeComposerWithSpies() {
      const realBuilder = new BigQueryQueryBuilder(new BigQueryClauseRenderer());
      const facade = {
        buildQuery: (
          _type: unknown,
          definition: Parameters<BigQueryQueryBuilder['buildQuery']>[0],
          options: Parameters<BigQueryQueryBuilder['buildQuery']>[1]
        ) => realBuilder.buildQuery(definition, options),
      };
      const blendedDataService = { resolveBlendingDecision: jest.fn() };
      const tableReferenceService = {
        resolveTableName: jest.fn().mockResolvedValue('`proj`.`ds`.`view_x`'),
      };
      const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
      const blendableSchemaService = { computeBlendableSchema: jest.fn() };
      const composer = new ReportSqlComposerService(
        blendedDataService as never,
        facade as never,
        tableReferenceService as never,
        capabilityService as never,
        blendableSchemaService as never,
        { validateForReport: jest.fn() } as never
      );
      return { composer, blendedDataService, blendableSchemaService };
    }

    // The warehouse dry-run pass at schema-save time composes through this wrapper —
    // these tests prove it never resolves a blending decision (so it needs no accessor / IDP
    // lookup, matching an unauthenticated schema-save call site) and emits the same real,
    // formula-substituted SQL the report path does.
    describe('composeMetricsOnly — the warehouse dry-run wrapper', () => {
      it('composes a single metric with no dimension columns and no GROUP BY', async () => {
        const { composer, blendedDataService, blendableSchemaService } = makeComposerWithSpies();

        const { sql } = await composer.composeMetricsOnly(dataMartWithCtr, ['ctr']);

        expect(sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
        expect(sql).not.toContain('GROUP BY');
        // No accessor is available at schema-save time — proven by never reaching the
        // accessor-consuming, schema-resolving decision path at all.
        expect(blendedDataService.resolveBlendingDecision).not.toHaveBeenCalled();
        expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
      });

      it('composes several metrics together, still with no dimension columns', async () => {
        const { composer } = makeComposerWithSpies();

        const { sql } = await composer.composeMetricsOnly(dataMartWithCtr, ['ctr', 'hidden_ratio']);

        expect(sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
        expect(sql).toContain(
          'SUM(`internal_clicks`) / NULLIF(SUM(`impressions`), 0) AS `hidden_ratio`'
        );
        expect(sql).not.toContain('GROUP BY');
      });
    });

    // A formula that reads a JOINED Data Mart has to be dry-run through the SAME blended
    // path the report itself will take. Composed flat it renders `main."amount"`, which either
    // fails at the warehouse (so a valid formula cannot be saved) or — the dangerous half —
    // SUCCEEDS against a same-named column of the main Data Mart, stamping
    // `warehouseValidation: 'passed'` for a query the warehouse never saw.
    describe('composeMetricsOnly — a formula that reads a joined Data Mart', () => {
      const JOINED_FORMULA =
        'SUM({{ref field="clicks"}}) * SUM({{ref path="orders" field="amount"}})';

      // `amount` is a real column of the MAIN Data Mart here, deliberately: that is the collision
      // that makes `main.amount` compile and a flat dry run pass.
      const dataMartWithJoinedMetric = (formula = JOINED_FORMULA) =>
        ({
          id: 'dm-joined',
          projectId: 'proj-joined',
          storage: { type: 'GOOGLE_BIGQUERY' },
          definition: { type: 'table', fullyQualifiedName: 'proj.ds.tbl' },
          schema: {
            fields: [
              { name: 'clicks', type: 'INTEGER', status: 'CONNECTED' },
              { name: 'amount', type: 'FLOAT', status: 'CONNECTED' },
              {
                name: 'rpc',
                type: 'FLOAT',
                status: 'CONNECTED',
                calculated: { formula, level: 'metric' },
              },
            ],
          },
        }) as never;

      const accessor = { userId: 'user-1', roles: ['editor'] };

      it('resolves a real blending decision and returns the blended SQL', async () => {
        const { composer, blendedDataService } = makeComposerWithSpies();
        blendedDataService.resolveBlendingDecision.mockResolvedValue({
          needsBlending: true,
          blendedSql: 'SELECT blended_rpc FROM joined_cte',
        });

        const { sql } = await composer.composeMetricsOnly(
          dataMartWithJoinedMetric(),
          ['rpc'],
          accessor
        );

        expect(sql).toBe('SELECT blended_rpc FROM joined_cte');
        // Reaching the decision at all is the assertion: `compose` skips it entirely whenever one
        // is precomputed, which is exactly what forced the flat path before.
        expect(blendedDataService.resolveBlendingDecision).toHaveBeenCalledTimes(1);
        // The SAVING user's identity, never a fabricated `{ userId: '' }` — the blendable schema's
        // access pass PERSISTS a default role scope for whatever user id it is handed.
        expect(blendedDataService.resolveBlendingDecision.mock.calls[0][1]).toEqual(accessor);
      });

      it('reuses a blendable schema already resolved for validation instead of resolving it twice', async () => {
        const { composer, blendedDataService, blendableSchemaService } = makeComposerWithSpies();
        blendedDataService.resolveBlendingDecision.mockResolvedValue({
          needsBlending: true,
          blendedSql: 'SELECT blended_rpc FROM joined_cte',
        });
        const precomputed = { nativeFields: [], blendedFields: [], availableSources: [] };

        await composer.composeMetricsOnly(
          dataMartWithJoinedMetric(),
          ['rpc'],
          accessor,
          precomputed as never
        );

        expect(blendedDataService.resolveBlendingDecision.mock.calls[0][2]).toBe(precomputed);
        expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
      });

      // The dangerous failure shape, pinned on its own: a decision that comes back flat while the
      // formula still reads a joined source must FAIL, not silently emit `main.amount`.
      it('never renders a joined reference against the main table, even on a name collision', async () => {
        const { composer, blendedDataService } = makeComposerWithSpies();
        blendedDataService.resolveBlendingDecision.mockResolvedValue({
          needsBlending: false,
          columnFilter: ['rpc'],
        });

        await expect(
          composer.composeMetricsOnly(dataMartWithJoinedMetric(), ['rpc'], accessor)
        ).rejects.toThrow(/orders\.amount/);
      });

      // Threading the accessor is what keeps `computeBlendableSchema` -> `canAccess` ->
      // `getRoleScope('')` -> `applyDefaultScopeToMember` from UPSERTING role-scope rows for a user
      // that does not exist. With no identity there is nothing safe to read the join tree with, so
      // the dry run is refused rather than run against a fabricated one.
      it('refuses rather than reading the join tree with a fabricated identity', async () => {
        const { composer, blendedDataService, blendableSchemaService } = makeComposerWithSpies();

        await expect(
          composer.composeMetricsOnly(dataMartWithJoinedMetric(), ['rpc'])
        ).rejects.toThrow(/\[rpc\].*identity/s);
        expect(blendedDataService.resolveBlendingDecision).not.toHaveBeenCalled();
        expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
      });

      // The bug class: a commented-out joined reference is not SQL, so it must not drag the
      // dry run onto the blended path (nor demand an accessor).
      it('stays on the flat path for a metric whose joined reference is commented out', async () => {
        const { composer, blendedDataService } = makeComposerWithSpies();

        const { sql } = await composer.composeMetricsOnly(
          dataMartWithJoinedMetric(
            'SUM({{ref field="clicks"}}) -- * SUM({{ref path="orders" field="amount"}})'
          ),
          ['rpc']
        );

        expect(sql).toContain('SUM(`clicks`)');
        expect(blendedDataService.resolveBlendingDecision).not.toHaveBeenCalled();
      });

      // Back-compat: a main-only formula must compose byte-identically to before — no decision, no
      // schema resolution, no accessor needed.
      it('leaves a main-only metric on the precomputed flat decision even when an accessor is given', async () => {
        const { composer, blendedDataService, blendableSchemaService } = makeComposerWithSpies();

        const { sql } = await composer.composeMetricsOnly(dataMartWithCtr, ['ctr'], accessor);

        expect(sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
        expect(blendedDataService.resolveBlendingDecision).not.toHaveBeenCalled();
        expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
      });
    });

    /**
     * The seam this task exists to establish, with NOTHING between `composeMetricsOnly` and real
     * SQL stubbed out: the real `BlendedReportDataService`, the real `OutputControlsValidatorService`
     * it uses as its chokepoint, the real capability service, the real formula dialect registry and
     * the real `BigQueryBlendedQueryBuilder`. Only the repositories, the warehouse-facing table
     * reference and the blendable schema are doubles.
     *
     * What it pins that the stubbed tests above cannot: the projection `composeMetricsOnly` builds
     * is `columnConfig: [<metric name>]` — no dimensions at all — and nothing else in the suite ever
     * drives that shape through the real decision path. If `validateForReport` rejected a
     * metric-name-only projection, or the blended builder refused one, EVERY joined save would 400
     * and every other test here would stay green.
     */
    describe('composeMetricsOnly end to end — real decision, real validator, real builder', () => {
      const ROI_FORMULA = 'SUM({{ref field="cost"}}) * SUM({{ref path="orders" field="amount"}})';

      const dataMart = {
        id: 'dm-1',
        projectId: 'proj-1',
        title: 'Main DM',
        storage: { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY },
        definition: { type: 'table', fullyQualifiedName: 'proj.ds.main' },
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            { name: 'cost', type: 'FLOAT', status: 'CONNECTED' },
            { name: 'channel', type: 'STRING', status: 'CONNECTED' },
            {
              name: 'roi',
              type: 'FLOAT',
              status: 'CONNECTED',
              calculated: { formula: ROI_FORMULA, level: 'metric' },
            },
          ],
        },
      } as never;

      function makeRealComposer() {
        const amount = {
          name: 'orders__amount',
          sourceRelationshipId: 'rel-orders',
          sourceDataMartId: 'dm-orders',
          sourceDataMartTitle: 'Orders',
          targetAlias: 'orders',
          originalFieldName: 'amount',
          type: 'FLOAT',
          isHidden: false,
          aggregateFunction: 'SUM',
          transitiveDepth: 1,
          aliasPath: 'orders',
          outputPrefix: 'orders',
        };
        const blendableSchema = {
          // Non-empty: an unactualized schema takes a different branch in the validator, and this
          // test is about the actualized one every real save has.
          nativeFields: [
            { name: 'cost', type: 'FLOAT', status: 'CONNECTED' },
            { name: 'channel', type: 'STRING', status: 'CONNECTED' },
          ],
          availableSources: [
            {
              aliasPath: 'orders',
              title: 'Orders',
              defaultAlias: 'orders',
              depth: 1,
              fieldCount: 1,
              isIncluded: true,
              isAccessibleForReporting: true,
              relationshipId: 'rel-orders',
              dataMartId: 'dm-orders',
            },
          ],
          blendedFields: [amount],
          calculatedFieldIssues: [],
        };
        const blendableSchemaService = {
          computeBlendableSchema: jest.fn().mockResolvedValue(blendableSchema),
        };
        const tableReferenceService = {
          resolveTableName: jest
            .fn()
            .mockImplementation((id: string) =>
              Promise.resolve(id === 'dm-orders' ? '`proj`.`ds`.`orders`' : '`proj`.`ds`.`main`')
            ),
        };
        const realBlendedBuilder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());
        const blendedDataService = new BlendedReportDataService(
          {
            findBySourceDataMartId: jest.fn().mockResolvedValue([
              {
                id: 'rel-orders',
                targetAlias: 'orders',
                sourceDataMart: { id: 'dm-1' },
                targetDataMart: { id: 'dm-orders', title: 'Orders' },
                joinConditions: [{ sourceFieldName: 'order_id', targetFieldName: 'order_id' }],
              },
            ]),
            findByIds: jest.fn().mockResolvedValue([]),
          } as never,
          blendableSchemaService as never,
          {
            buildBlendedQuery: (
              _type: unknown,
              context: Parameters<BigQueryBlendedQueryBuilder['buildBlendedQuery']>[0]
            ) => realBlendedBuilder.buildBlendedQuery(context),
          } as never,
          tableReferenceService as never,
          { getPublicOrigin: () => 'https://app.example.com' } as never,
          // The REAL chokepoint: this is what would reject a dimension-free projection.
          new OutputControlsValidatorService(
            new OutputControlsCapabilityService(),
            blendableSchemaService as never
          ) as never,
          { fetchUserProjection: jest.fn().mockResolvedValue(undefined) } as never,
          createFormulaFunctionDialectRegistry() as never
        );
        const composer = new ReportSqlComposerService(
          blendedDataService,
          { buildQuery: jest.fn() } as never,
          tableReferenceService as never,
          new OutputControlsCapabilityService() as never,
          blendableSchemaService as never,
          new OutputControlsValidatorService(
            new OutputControlsCapabilityService(),
            blendableSchemaService as never
          ) as never
        );
        return { composer, tableReferenceService };
      }

      it('composes real blended SQL for a projection that is nothing but the metric name', async () => {
        const { composer } = makeRealComposer();

        const { sql } = await composer.composeMetricsOnly(dataMart, ['roi'], {
          userId: 'user-1',
          roles: ['editor'],
        });

        // A blended query, not the flat one, with the joined half lifted into its own metric
        // sleeve — the de-duplicating one, so the join's fan-out cannot distort the SUM.
        expect(sql).toContain('main AS (');
        expect(sql).toContain('sleeve_fx_roi_1 AS (');
        expect(sql).toContain('SUM(main.cost) * ANY_VALUE(sleeve_fx_roi_1._fx_roi_1) AS `roi`');
        // The failure this whole task is about: the joined field read off the MAIN table.
        expect(sql).not.toContain('main.amount');
        // Dimension-free: the metric is the whole projection, so the OUTER select groups by
        // nothing (the pre-join roll-up CTE has a GROUP BY of its own, which is not this).
        expect(sql.slice(sql.lastIndexOf('\nSELECT'))).not.toContain('GROUP BY');
      });

      it('refreshes each Data Mart table reference once per save, not once per composed query', async () => {
        const { composer, tableReferenceService } = makeRealComposer();
        const accessor = { userId: 'user-1', roles: ['editor'] };
        // The shape `CalculatedFieldValidatorService` produces when a combined dry run fails and it
        // re-composes per metric to attribute the failure.
        const memo = new Map<string, Promise<string>>();

        await composer.composeMetricsOnly(dataMart, ['roi'], accessor, undefined, memo);
        await composer.composeMetricsOnly(dataMart, ['roi'], accessor, undefined, memo);

        // Every resolution of both compositions carries the SAME memo, which is what lets
        // DataMartTableReferenceService issue one CREATE OR REPLACE VIEW per Data Mart per save
        // instead of one per composed query (the de-duplication itself is pinned in that
        // service's own spec — the service is a double here).
        const calls = tableReferenceService.resolveTableName.mock.calls;
        expect(calls.map((c: unknown[]) => c[0])).toEqual([
          'dm-1',
          'dm-orders',
          'dm-1',
          'dm-orders',
        ]);
        for (const call of calls) expect(call[2]).toBe(memo);
      });
    });
  });

  // A joined COUNT_DISTINCT reads the raw pre-join rows while COUNT counts the rows surviving the
  // join, so the pair can invert COUNT DISTINCT <= COUNT.
});
