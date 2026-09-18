import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AdvancedSearchIndexSyncService } from './advanced-search-index-sync.service';
import { SearchReindexTrigger } from '../entities/search/search-reindex-trigger.entity';
import {
  SearchDataMartProjectReindexTrigger,
  SearchDataStorageProjectReindexTrigger,
  SearchDataDestinationProjectReindexTrigger,
  SearchReportProjectReindexTrigger,
} from '../entities/search/search-project-reindex-trigger.entity';
import { SearchableEntityType as EntityType } from '../../common/search/search.facade';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { SearchEntityReindexTriggerHandler } from '../search/indexing/search-reindex-trigger-handler.service';
import { SearchIndexerService } from '../search/indexing/search-indexer.service';
import { AdvancedSearchConfig } from '../search/config/advanced-search.config';
import { SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { DirectTriggerRunnerService } from '../../common/scheduler/services/runners/direct-trigger-runner.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';

describe('Report rename queue persistence', () => {
  let db: DataSource;
  let service: AdvancedSearchIndexSyncService;

  beforeAll(async () => {
    db = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: true,
      entities: [
        SearchReindexTrigger,
        SearchDataMartProjectReindexTrigger,
        SearchDataStorageProjectReindexTrigger,
        SearchDataDestinationProjectReindexTrigger,
        SearchReportProjectReindexTrigger,
      ],
    }).initialize();
    service = new AdvancedSearchIndexSyncService(
      db.getRepository(SearchReindexTrigger),
      db.getRepository(SearchDataMartProjectReindexTrigger),
      db.getRepository(SearchDataStorageProjectReindexTrigger),
      db.getRepository(SearchDataDestinationProjectReindexTrigger),
      db.getRepository(SearchReportProjectReindexTrigger)
    );
  });
  afterAll(async () => db.destroy());
  beforeEach(async () => {
    await db.getRepository(SearchReindexTrigger).clear();
    await db.getRepository(SearchReportProjectReindexTrigger).clear();
  });

  it('continues after a failed page and keeps the final job in ERROR', async () => {
    const jobs = db.getRepository(SearchReindexTrigger);
    const job = await jobs.save(
      jobs.create({
        projectId: 'p',
        entityType: EntityType.DATA_MART,
        entityId: 'failed-parent',
        operation: 'REINDEX_REPORTS',
        isActive: true,
        status: TriggerStatus.READY,
      })
    );
    const cursor = { createdAt: '2026-09-18 10:00:00', id: 'r-50' };
    const reindexReportsPage = jest
      .fn()
      .mockResolvedValueOnce({ nextCursor: cursor, errors: 1 })
      .mockResolvedValueOnce({ nextCursor: null, errors: 0 });
    const handler = new SearchEntityReindexTriggerHandler(
      {} as SchedulerFacade,
      jobs,
      { reindexReportsPage } as unknown as SearchIndexerService,
      {} as AdvancedSearchConfig
    );
    const runner = new DirectTriggerRunnerService(
      handler,
      { now: () => new Date() } as SystemTimeService,
      {
        isInShutdownMode: () => false,
        registerActiveProcess: () => 'process',
        unregisterActiveProcess: () => undefined,
      } as unknown as GracefulShutdownService
    );
    await runner.runTriggers([job]);
    const pending = await jobs.findOneByOrFail({ id: job.id });
    expect(pending.status).toBe(TriggerStatus.IDLE);
    expect(pending.reportProgress).toEqual({ cursor, errors: 1 });
    await runner.runTriggers([pending]);
    const finished = await jobs.findOneByOrFail({ id: job.id });
    expect(finished.status).toBe(TriggerStatus.ERROR);
    expect(finished.reportProgress).toEqual({ cursor: null, errors: 1 });
    expect(reindexReportsPage.mock.calls[1][2]).toEqual(cursor);
  });

  it('retains both concurrent rename requests and keeps parent REINDEX/DELETE separate', async () => {
    const projects = db.getRepository(SearchReportProjectReindexTrigger);
    await projects.save(
      projects.create({ projectId: 'p', isActive: true, status: TriggerStatus.PROCESSING })
    );
    await Promise.all([
      service.scheduleReportsReindex(EntityType.DATA_MART, 'dm', 'p'),
      service.scheduleReportsReindex(EntityType.DATA_MART, 'dm', 'p'),
    ]);
    await service.scheduleTypeProjectSync(EntityType.REPORT, 'p');
    expect(await projects.count()).toBe(1);
    const jobs = db.getRepository(SearchReindexTrigger);
    const related = await jobs.findBy({ operation: 'REINDEX_REPORTS' });
    expect(related).toHaveLength(2);
    related[0].reportProgress = {
      cursor: { createdAt: '2026-09-18 10:00:00', id: 'r-50' },
      errors: 0,
    };
    related[0].onSuccess(new Date());
    await jobs.save(related[0]);
    await service.scheduleReindex(EntityType.DATA_MART, 'dm', 'p');
    await service.scheduleDelete(EntityType.DATA_MART, 'dm', 'p');
    expect(await jobs.countBy({ operation: 'REINDEX_REPORTS' })).toBe(2);
    expect(await jobs.countBy({ operation: 'DELETE' })).toBe(1);
    expect((await jobs.findOneByOrFail({ id: related[0].id })).reportProgress).toEqual(
      related[0].reportProgress
    );
  });
});
