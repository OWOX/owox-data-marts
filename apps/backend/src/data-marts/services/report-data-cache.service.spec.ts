import { ReportDataCacheService } from './report-data-cache.service';
import { Report } from '../entities/report.entity';
import { BlendingDecision } from '../dto/domain/blending-decision.dto';
import { PrepareReportDataOptions } from '../data-storage-types/interfaces/data-storage-report-reader.interface';

/**
 * Regression coverage for the Looker Studio cached-reader path: it must carry
 * output-controls SQL + bound params into the reader exactly like RunReportService,
 * otherwise non-blended reports drop filter/sort/limit and Athena's positional `?`
 * placeholders execute unbound.
 */
describe('ReportDataCacheService — output controls on the cached path', () => {
  const buildReport = (overrides: Partial<Report> = {}): Report =>
    ({
      id: 'rep-1',
      createdById: 'user-1',
      destinationConfig: { type: 'GOOGLE_SHEETS' },
      dataMart: {
        id: 'dm-1',
        projectId: 'proj-1',
        storage: { type: 'AWS_ATHENA' },
      },
      ...overrides,
    }) as unknown as Report;

  const setup = (
    decision: BlendingDecision,
    composeResult?: { sql: string; params?: unknown[] }
  ) => {
    const reader = {
      prepareReportData: jest.fn().mockResolvedValue({ dataHeaders: [] }),
      readReportDataBatch: jest.fn().mockResolvedValue({}),
      getState: jest.fn().mockReturnValue(null),
    };
    const cacheRepository = {
      findOne: jest.fn().mockResolvedValue(null), // force cache miss → createNewCachedReader
      save: jest.fn().mockResolvedValue({}),
    };
    const readerResolver = { resolve: jest.fn().mockResolvedValue(reader) };
    const blendedReportDataService = {
      resolveBlendingDecision: jest.fn().mockResolvedValue(decision),
    };
    const reportSqlComposerService = {
      compose: jest.fn().mockResolvedValue(composeResult ?? { sql: 'unused' }),
    };

    const service = new ReportDataCacheService(
      cacheRepository as never,
      readerResolver as never,
      blendedReportDataService as never,
      {} as never,
      reportSqlComposerService as never
    );

    return { service, reader, reportSqlComposerService, blendedReportDataService };
  };

  const optionsPassedToReader = (reader: {
    prepareReportData: jest.Mock;
  }): PrepareReportDataOptions => reader.prepareReportData.mock.calls[0][1];

  it('composes SQL + params for a non-blended report with output controls', async () => {
    const composed = { sql: 'SELECT a FROM t WHERE a = ?', params: [{ name: 'p0', value: 'x' }] };
    const { service, reader, reportSqlComposerService } = setup(
      { needsBlending: false, columnFilter: ['a'] },
      composed
    );
    const report = buildReport({
      filterConfig: [{ column: 'a', operator: 'eq', value: 'x' }],
    } as never);

    await service.getOrCreateCachedReader(report, { userId: 'user-1', roles: ['editor'] } as never);

    expect(reportSqlComposerService.compose).toHaveBeenCalledTimes(1);
    const opts = optionsPassedToReader(reader);
    expect(opts.sqlOverride).toBe(composed.sql);
    expect(opts.sqlOverrideParams).toEqual(composed.params);
  });

  it('forwards blended SQL params without re-composing', async () => {
    const decision: BlendingDecision = {
      needsBlending: true,
      blendedSql: 'WITH main AS (...) SELECT * FROM main WHERE x = ?',
      params: [{ name: 'p0', value: 'y' }],
    };
    const { service, reader, reportSqlComposerService } = setup(decision);
    const report = buildReport({
      filterConfig: [{ column: 'x', operator: 'eq', value: 'y' }],
    } as never);

    await service.getOrCreateCachedReader(report, { userId: 'user-1', roles: ['editor'] } as never);

    expect(reportSqlComposerService.compose).not.toHaveBeenCalled();
    const opts = optionsPassedToReader(reader);
    expect(opts.sqlOverride).toBe(decision.blendedSql);
    expect(opts.sqlOverrideParams).toEqual(decision.params);
  });

  it('leaves overrides undefined for a plain report with no output controls', async () => {
    const { service, reader, reportSqlComposerService } = setup({
      needsBlending: false,
      columnFilter: ['a'],
    });
    const report = buildReport(); // no filter/sort/limit

    await service.getOrCreateCachedReader(report, { userId: 'user-1', roles: ['editor'] } as never);

    expect(reportSqlComposerService.compose).not.toHaveBeenCalled();
    const opts = optionsPassedToReader(reader);
    expect(opts.sqlOverride).toBeUndefined();
    expect(opts.sqlOverrideParams).toBeUndefined();
  });
});
