import { ReportDataCacheService } from './report-data-cache.service';
import { Report } from '../entities/report.entity';
import { BlendingDecision } from '../dto/domain/blending-decision.dto';
import { PrepareReportDataOptions } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

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
      inlineStaticSql: jest.fn((_storageType: unknown, sql: string) => sql),
    };

    const service = new ReportDataCacheService(
      cacheRepository as never,
      readerResolver as never,
      blendedReportDataService as never,
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

    const cached = await service.getOrCreateCachedReader(report, {
      userId: 'user-1',
      roles: ['editor'],
    } as never);

    expect(reportSqlComposerService.compose).not.toHaveBeenCalled();
    const opts = optionsPassedToReader(reader);
    expect(opts.sqlOverride).toBe(decision.blendedSql);
    expect(opts.sqlOverrideParams).toEqual(decision.params);
    expect(cached.executionSqlQuery).toBeDefined();
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

  it('exposes executionSqlQuery (inlined static SQL) for an output-controls report', async () => {
    const composed = { sql: 'SELECT a FROM t WHERE a = ?', params: [{ name: 'p0', value: 'x' }] };
    const { service, reportSqlComposerService } = setup(
      { needsBlending: false, columnFilter: ['a'] },
      composed
    );
    reportSqlComposerService.inlineStaticSql.mockReturnValue("SELECT a FROM t WHERE a = 'x'");
    const report = buildReport({
      filterConfig: [{ column: 'a', operator: 'eq', value: 'x' }],
    } as never);

    const cached = await service.getOrCreateCachedReader(report, {
      userId: 'user-1',
      roles: ['editor'],
    } as never);

    expect(reportSqlComposerService.inlineStaticSql).toHaveBeenCalledWith(
      'AWS_ATHENA',
      composed.sql,
      composed.params
    );
    expect(cached.executionSqlQuery).toBe("SELECT a FROM t WHERE a = 'x'");
  });

  it('leaves executionSqlQuery undefined for a plain report with no output controls', async () => {
    const { service, reportSqlComposerService } = setup({
      needsBlending: false,
      columnFilter: ['a'],
    });
    const report = buildReport(); // no filter/sort/limit

    const cached = await service.getOrCreateCachedReader(report, {
      userId: 'user-1',
      roles: ['editor'],
    } as never);

    expect(reportSqlComposerService.inlineStaticSql).not.toHaveBeenCalled();
    expect(cached.executionSqlQuery).toBeUndefined();
  });

  it('exposes inlined executionSqlQuery for a blended report with params', async () => {
    const blendedSql = 'WITH m AS (...) SELECT * FROM m WHERE x = ?';
    const params = [{ name: 'p0', value: 'y' }];
    const decision: BlendingDecision = { needsBlending: true, blendedSql, params };
    const { service, reportSqlComposerService } = setup(decision);
    reportSqlComposerService.inlineStaticSql.mockReturnValue(
      "WITH m AS (...) SELECT * FROM m WHERE x = 'y'"
    );
    const report = buildReport({
      filterConfig: [{ column: 'x', operator: 'eq', value: 'y' }],
    } as never);

    const cached = await service.getOrCreateCachedReader(report, {
      userId: 'user-1',
      roles: ['editor'],
    } as never);

    expect(reportSqlComposerService.inlineStaticSql).toHaveBeenCalledWith(
      'AWS_ATHENA',
      blendedSql,
      params
    );
    expect(cached.executionSqlQuery).toBe("WITH m AS (...) SELECT * FROM m WHERE x = 'y'");
  });
});

/**
 * The cleanup path must release external cached artifacts only where persisted
 * state can be finalized without starting a fresh read. Athena has S3 result
 * files to remove; other storages are deleted without reader restoration because
 * their current restore path either finalizes as a no-op or starts a new query.
 */
describe('ReportDataCacheService — cleanup finalize path', () => {
  const setupCleanup = (storageType = DataStorageType.AWS_ATHENA) => {
    const reader = {
      prepareReportData: jest.fn().mockResolvedValue({ dataHeaders: [] }),
      initFromState: jest.fn().mockResolvedValue(undefined),
      finalize: jest.fn().mockResolvedValue(undefined),
    };
    const entry = {
      id: 'cache-1',
      storageType,
      readerState: { outputBucket: 'bucket', outputPrefix: 'prefix' },
      dataDescription: { dataHeaders: [] },
      report: {
        id: 'rep-1',
        dataMart: { id: 'dm-1', projectId: 'proj-1', storage: { type: storageType } },
      } as unknown as Report,
    };
    const cacheRepository = {
      find: jest.fn().mockResolvedValue([entry]),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const readerResolver = { resolve: jest.fn().mockResolvedValue(reader) };
    const blendedReportDataService = { resolveBlendingDecision: jest.fn() };

    const service = new ReportDataCacheService(
      cacheRepository as never,
      readerResolver as never,
      blendedReportDataService as never,
      {} as never
    );

    return { service, reader, entry, cacheRepository, readerResolver, blendedReportDataService };
  };

  it('finalizes from cached state without resolving a fresh blending decision', async () => {
    const { service, reader, entry, cacheRepository, blendedReportDataService } = setupCleanup();

    await service.invalidateByReportId('rep-1');

    expect(blendedReportDataService.resolveBlendingDecision).not.toHaveBeenCalled();
    expect(reader.prepareReportData).toHaveBeenCalledWith(entry.report, {});
    expect(reader.initFromState).toHaveBeenCalledWith(
      entry.readerState,
      entry.dataDescription.dataHeaders
    );
    expect(reader.finalize).toHaveBeenCalledTimes(1);
    expect(cacheRepository.delete).toHaveBeenCalled();
  });

  it.each([
    DataStorageType.DATABRICKS,
    DataStorageType.SNOWFLAKE,
    DataStorageType.GOOGLE_BIGQUERY,
    DataStorageType.AWS_REDSHIFT,
  ])('deletes %s entries without restoring a reader during cleanup', async storageType => {
    const { service, cacheRepository, readerResolver, blendedReportDataService } =
      setupCleanup(storageType);

    await service.invalidateByReportId('rep-1');

    expect(blendedReportDataService.resolveBlendingDecision).not.toHaveBeenCalled();
    expect(readerResolver.resolve).not.toHaveBeenCalled();
    expect(cacheRepository.delete).toHaveBeenCalled();
  });

  it('still deletes entries when finalize itself fails', async () => {
    const { service, reader, cacheRepository } = setupCleanup();
    reader.finalize.mockRejectedValue(new Error('storage unavailable'));

    await service.invalidateByReportId('rep-1');

    expect(cacheRepository.delete).toHaveBeenCalled();
  });
});
