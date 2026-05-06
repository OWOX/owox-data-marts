import { ReportSqlComposerService } from './report-sql-composer.service';
import { Report } from '../entities/report.entity';

describe('ReportSqlComposerService', () => {
  const buildReport = (overrides: Partial<Report> = {}): Report =>
    ({
      id: 'rep-1',
      title: 'Report',
      dataMart: {
        id: 'dm-1',
        definition: { sqlQuery: 'SELECT 1' },
        storage: { id: 'storage-1', type: 'BIGQUERY' },
      },
      ...overrides,
    }) as unknown as Report;

  const createService = (
    decision: { needsBlending: boolean; blendedSql?: string; columnFilter?: string[] },
    builtSql = 'SELECT built FROM dm'
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

    const service = new ReportSqlComposerService(
      blendedReportDataService as never,
      queryBuilderFacade as never,
      tableReferenceService as never
    );

    return { service, blendedReportDataService, queryBuilderFacade, tableReferenceService };
  };

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
      'BIGQUERY',
      { sqlQuery: 'SELECT 1' },
      expect.objectContaining({ columns: ['a', 'b'] })
    );
  });

  it('falls back to the query builder facade when needsBlending is true but blendedSql is missing', async () => {
    const { service, queryBuilderFacade } = createService(
      { needsBlending: true, columnFilter: undefined },
      'SELECT fallback FROM dm'
    );

    const result = await service.compose(buildReport());

    expect(result.sql).toBe('SELECT fallback FROM dm');
    expect(queryBuilderFacade.buildQuery).toHaveBeenCalled();
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
    const composer = new ReportSqlComposerService(
      blendedDataService as never,
      queryBuilderFacade as never,
      tableReferenceService as never
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
    const composer = new ReportSqlComposerService(
      blendedDataService as never,
      queryBuilderFacade as never,
      tableReferenceService as never
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
      {} as never
    );
    const result = await composer.compose({
      filterConfig: [{ column: 'a', operator: 'eq', value: 1 }],
    } as never);
    expect(result).toEqual({
      sql: 'WITH ... SELECT ... WHERE @p0',
      params: [{ name: 'p0', value: 1 }],
    });
  });
});
