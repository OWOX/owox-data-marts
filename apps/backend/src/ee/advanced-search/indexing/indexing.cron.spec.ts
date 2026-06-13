import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { IndexingCron } from './indexing.cron';
import { SearchIndexerService } from './search-indexer.service';
import { EeLicenseService } from '../../shared/ee-license.service';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';

function makeConfig(overrides: Partial<AdvancedSearchConfig> = {}): AdvancedSearchConfig {
  return {
    modelCacheDir: null,
    reconcileCron: '*/10 * * * *',
    topK: 3,
    indexBatchSize: 20,
    ...overrides,
  };
}

async function buildCron(opts: { executionEnabled: boolean; licensed: boolean }): Promise<{
  cron: IndexingCron;
  indexer: jest.Mocked<Pick<SearchIndexerService, 'reconcile' | 'reindexDataMart'>>;
  registeredJobs: Map<string, CronJob>;
}> {
  const indexer: jest.Mocked<Pick<SearchIndexerService, 'reconcile' | 'reindexDataMart'>> = {
    reconcile: jest.fn().mockResolvedValue(undefined),
    reindexDataMart: jest.fn().mockResolvedValue(undefined),
  };

  const eeLicense = {
    isLicensed: jest.fn().mockReturnValue(opts.licensed),
    verifyLicensed: jest.fn(),
  };

  const configService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'SCHEDULER_EXECUTION_ENABLED') return opts.executionEnabled;
      return undefined;
    }),
  };

  const registeredJobs = new Map<string, CronJob>();
  const schedulerRegistry = {
    addCronJob: jest.fn((name: string, job: CronJob) => {
      registeredJobs.set(name, job);
    }),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      IndexingCron,
      { provide: SearchIndexerService, useValue: indexer },
      { provide: EeLicenseService, useValue: eeLicense },
      { provide: ConfigService, useValue: configService },
      { provide: SchedulerRegistry, useValue: schedulerRegistry },
      { provide: ADVANCED_SEARCH_CONFIG, useValue: makeConfig() },
    ],
  }).compile();

  return {
    cron: module.get(IndexingCron),
    indexer: indexer as jest.Mocked<Pick<SearchIndexerService, 'reconcile' | 'reindexDataMart'>>,
    registeredJobs,
  };
}

describe('IndexingCron', () => {
  let activeJobs: Map<string, CronJob>;

  afterEach(async () => {
    if (activeJobs) {
      for (const job of activeJobs.values()) {
        await job.stop();
      }
    }
  });

  describe('onApplicationBootstrap', () => {
    it('registers the cron job with the scheduler', async () => {
      const { cron, registeredJobs } = await buildCron({ executionEnabled: false, licensed: true });
      activeJobs = registeredJobs;

      cron.onApplicationBootstrap();

      expect(registeredJobs.has('advanced-search.reconcile')).toBe(true);
    });

    it('runs initial reconcile when execution enabled and licensed', async () => {
      const { cron, indexer, registeredJobs } = await buildCron({
        executionEnabled: true,
        licensed: true,
      });
      activeJobs = registeredJobs;

      cron.onApplicationBootstrap();

      await new Promise(resolve => setImmediate(resolve));

      expect(indexer.reconcile).toHaveBeenCalledTimes(1);
    });

    it('skips initial reconcile when execution disabled', async () => {
      const { cron, indexer, registeredJobs } = await buildCron({
        executionEnabled: false,
        licensed: true,
      });
      activeJobs = registeredJobs;

      cron.onApplicationBootstrap();

      await new Promise(resolve => setImmediate(resolve));

      expect(indexer.reconcile).not.toHaveBeenCalled();
    });

    it('skips initial reconcile when unlicensed', async () => {
      const { cron, indexer, registeredJobs } = await buildCron({
        executionEnabled: true,
        licensed: false,
      });
      activeJobs = registeredJobs;

      cron.onApplicationBootstrap();

      await new Promise(resolve => setImmediate(resolve));

      expect(indexer.reconcile).not.toHaveBeenCalled();
    });
  });

  describe('tick (via cron)', () => {
    it('does not call indexer when SCHEDULER_EXECUTION_ENABLED is false', async () => {
      const { cron, indexer, registeredJobs } = await buildCron({
        executionEnabled: false,
        licensed: true,
      });
      activeJobs = registeredJobs;

      cron.onApplicationBootstrap();

      await (cron as unknown as { tick(): Promise<void> })['tick']();

      expect(indexer.reconcile).not.toHaveBeenCalled();
    });

    it('does not call indexer when unlicensed', async () => {
      const { cron, indexer, registeredJobs } = await buildCron({
        executionEnabled: true,
        licensed: false,
      });
      activeJobs = registeredJobs;

      cron.onApplicationBootstrap();

      await (cron as unknown as { tick(): Promise<void> })['tick']();

      expect(indexer.reconcile).not.toHaveBeenCalled();
    });

    it('calls indexer.reconcile when enabled and licensed', async () => {
      const { cron, indexer, registeredJobs } = await buildCron({
        executionEnabled: true,
        licensed: true,
      });
      activeJobs = registeredJobs;

      cron.onApplicationBootstrap();

      await (cron as unknown as { tick(): Promise<void> })['tick']();

      expect(indexer.reconcile).toHaveBeenCalled();
    });

    it('cron callback catches a rejecting tick instead of leaking an unhandled rejection', async () => {
      const { cron, indexer, registeredJobs } = await buildCron({
        executionEnabled: true,
        licensed: true,
      });
      activeJobs = registeredJobs;
      indexer.reconcile.mockRejectedValue(new Error('boom'));

      cron.onApplicationBootstrap();
      const job = registeredJobs.get('advanced-search.reconcile')!;
      void job.fireOnTick();
      await new Promise(setImmediate);

      expect(indexer.reconcile).toHaveBeenCalled();
    });
  });
});
