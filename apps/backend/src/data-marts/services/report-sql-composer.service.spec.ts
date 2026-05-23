import { BadRequestException } from '@nestjs/common';
import { ReportSqlComposerService } from './report-sql-composer.service';
import { Report } from '../entities/report.entity';
import { BigQueryQueryBuilder } from '../data-storage-types/bigquery/services/bigquery-query.builder';
import { BigQueryClauseRenderer } from '../data-storage-types/bigquery/services/bigquery-clause-renderer';
import { isQueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

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

    const outputControlsValidator = {
      validateForReport: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ReportSqlComposerService(
      blendedReportDataService as never,
      queryBuilderFacade as never,
      tableReferenceService as never,
      capabilityService as never,
      outputControlsValidator as never
    );

    return {
      service,
      blendedReportDataService,
      queryBuilderFacade,
      tableReferenceService,
      capabilityService,
      outputControlsValidator,
    };
  };

  it('re-validates output controls against the current schema before composing', async () => {
    const { service, outputControlsValidator } = createService(
      { needsBlending: false, columnFilter: ['a'] },
      'SELECT 1'
    );
    const report = buildReport({
      columnConfig: ['a'],
      filterConfig: [{ column: 'a', operator: 'eq', value: 1 }],
      sortConfig: [{ column: 'a', direction: 'asc' }],
      limitConfig: 50,
    } as Partial<Report>);

    await service.compose(report);

    expect(outputControlsValidator.validateForReport).toHaveBeenCalledTimes(1);
    expect(outputControlsValidator.validateForReport).toHaveBeenCalledWith({
      storageType: 'GOOGLE_BIGQUERY',
      dataMartId: 'dm-1',
      projectId: undefined,
      columnConfig: ['a'],
      filterConfig: report.filterConfig,
      sortConfig: report.sortConfig,
      limitConfig: 50,
    });
  });

  it('propagates validator rejection (stale stored rule against drifted schema)', async () => {
    const { service, outputControlsValidator } = createService({
      needsBlending: false,
      columnFilter: ['a'],
    });
    const validatorError = new BadRequestException({
      message: 'Output controls validation failed',
      details: { errors: [{ code: 'FILTER_COLUMN_UNKNOWN', column: 'stale_col' }] },
    });
    outputControlsValidator.validateForReport.mockRejectedValue(validatorError);

    await expect(service.compose(buildReport())).rejects.toBe(validatorError);
  });

  it('returns blended SQL when decision.needsBlending and blendedSql is present', async () => {
    const { service, queryBuilderFacade } = createService({
      needsBlending: true,
      blendedSql: 'SELECT blended FROM cte',
    });

    const result = await service.compose(buildReport());

    expect(result.sql).toBe('SELECT blended FROM cte');
    expect(queryBuilderFacade.buildQuery).not.toHaveBeenCalled();
  });

  it('falls back to the query builder facade when blending is not needed', async () => {
    const { service, queryBuilderFacade } = createService(
      { needsBlending: false, columnFilter: ['a', 'b'] },
      'SELECT a, b FROM dm'
    );

    const result = await service.compose(buildReport());

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

    await expect(service.compose(buildReport())).rejects.toMatchObject({
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

    await expect(service.compose(report)).rejects.toThrow('Data Mart definition is not set.');
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
    const composer = new ReportSqlComposerService(
      blendedDataService as never,
      queryBuilderFacade as never,
      tableReferenceService as never,
      capabilityService as never,
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
    const result = await composer.compose(report);
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

  it('does not resolve mainTableReference when no output controls', async () => {
    const tableReferenceService = { resolveTableName: jest.fn() };
    const queryBuilderFacade = { buildQuery: jest.fn().mockResolvedValue('SELECT * FROM t') };
    const blendedDataService = {
      resolveBlendingDecision: jest
        .fn()
        .mockResolvedValue({ needsBlending: false, columnFilter: ['a'] }),
    };
    const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
    const composer = new ReportSqlComposerService(
      blendedDataService as never,
      queryBuilderFacade as never,
      tableReferenceService as never,
      capabilityService as never,
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
    const result = await composer.compose(report);
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
      { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
    );
    const result = await composer.compose({
      filterConfig: [{ column: 'a', operator: 'eq', value: 1 }],
      dataMart: {
        id: 'm',
        projectId: 'p',
        storage: { type: 'GOOGLE_BIGQUERY' },
      },
    } as never);
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

    await expect(service.compose(report)).rejects.toThrow(BadRequestException);
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

    await expect(service.compose(report)).resolves.toBeDefined();
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
    await expect(service.compose(report)).rejects.toMatchObject({
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
    await expect(service.compose(report)).rejects.toMatchObject({
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

      return new ReportSqlComposerService(
        blendedDataService as never,
        facade as never,
        tableReferenceService as never,
        capabilityService as never,
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

      const result = await composer.compose(report);

      expect(result.sql).toContain('SELECT `name`, `amount`');
      expect(result.sql).toContain('FROM `proj`.`ds`.`tbl`');
      expect(result.sql).toContain('WHERE `name` = @p0');
      expect(result.sql).toContain('AND `amount` BETWEEN @p1 AND @p2');
      expect(result.sql).toContain('ORDER BY `amount` DESC');
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

      const result = await composer.compose(report);

      expect(result.sql).toContain('STRPOS(`name`, @p0) > 0');
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

      const result = await composer.compose(report);

      // is_empty has zero params but the result still must come back as a
      // QueryBuildResult shape so the executor handles it uniformly.
      expect(isQueryBuildResult({ sql: result.sql, params: result.params ?? [] })).toBe(true);
      expect(result.params).toEqual([]);
      expect(result.sql).toContain("(`name` IS NULL OR `name` = '')");
    });
  });
});
