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

    const service = new ReportSqlComposerService(
      blendedReportDataService as never,
      queryBuilderFacade as never
    );

    return { service, blendedReportDataService, queryBuilderFacade };
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
      { columns: ['a', 'b'] }
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
});
