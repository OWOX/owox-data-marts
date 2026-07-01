import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { CronJob } from 'cron';
import { SchedulerFacadeImpl } from './scheduler-facade.impl';
import { TriggerFetcherFactory } from '../services/fetchers/trigger-fetcher-factory.service';
import { TriggerFetcherService } from '../services/fetchers/trigger-fetcher.service';
import { GracefulShutdownService } from '../services/graceful-shutdown.service';
import { SystemTimeService } from '../services/system-time.service';
import { TriggerRunnerFactory } from '../services/runners/trigger-runner.factory';
import { TriggerRunnerService } from '../services/runners/trigger-runner.interface';
import { Trigger } from '../shared/entities/trigger.entity';
import { TriggerHandler } from '../shared/trigger-handler.interface';

class TestTrigger extends Trigger {}

class TestTriggerHandler implements TriggerHandler<TestTrigger> {
  constructor(private readonly repository: Repository<TestTrigger>) {}

  getTriggerRepository(): Repository<TestTrigger> {
    return this.repository;
  }

  async handleTrigger(): Promise<void> {}

  processingCronExpression(): string {
    return '* * * * * *';
  }
}

describe('SchedulerFacadeImpl', () => {
  const registeredJobs = new Map<string, CronJob>();

  let service: SchedulerFacadeImpl;
  let fetcher: jest.Mocked<
    Pick<
      TriggerFetcherService<TestTrigger>,
      'fetchTriggersReadyForProcessing' | 'fetchTriggersForRunCancellation'
    >
  >;
  let runner: jest.Mocked<TriggerRunnerService<TestTrigger>>;

  beforeEach(() => {
    registeredJobs.clear();

    const schedulerRegistry = {
      addCronJob: jest.fn((name: string, job: CronJob) => {
        registeredJobs.set(name, job);
      }),
    } as unknown as SchedulerRegistry;

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'SCHEDULER_EXECUTION_ENABLED') {
          return true;
        }
        if (key === 'SCHEDULER_TIMEZONE') {
          return 'UTC';
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    fetcher = {
      fetchTriggersReadyForProcessing: jest.fn(async () => []),
      fetchTriggersForRunCancellation: jest.fn(async () => []),
    };
    const triggerFetcherFactory = {
      createFetcher: jest.fn(() => fetcher),
    } as unknown as TriggerFetcherFactory;

    runner = {
      runTriggers: jest.fn(async () => {}),
      abortTriggerRuns: jest.fn(async () => {}),
    };
    const triggerRunnerFactory = {
      createRunner: jest.fn(async () => runner),
    } as unknown as TriggerRunnerFactory;

    const systemTimeService = {} as SystemTimeService;
    const gracefulShutdownService = {
      isInShutdownMode: jest.fn(() => false),
    } as unknown as GracefulShutdownService;

    service = new SchedulerFacadeImpl(
      schedulerRegistry,
      configService,
      triggerFetcherFactory,
      triggerRunnerFactory,
      systemTimeService,
      gracefulShutdownService
    );
  });

  afterEach(() => {
    for (const job of registeredJobs.values()) {
      void job.stop();
    }
  });

  it('uses the scheduler abort job to abort cancelling trigger runs', async () => {
    const repository = {} as Repository<TestTrigger>;
    const triggerHandler = new TestTriggerHandler(repository);
    const trigger = Object.assign(new TestTrigger(), { id: 'trigger-1' });
    fetcher.fetchTriggersForRunCancellation.mockResolvedValueOnce([trigger]);

    await service.registerTriggerHandler(triggerHandler);

    const abortJob = registeredJobs.get('TestTriggerHandler [abort-run-check]');
    expect(abortJob).toBeDefined();

    await abortJob!.fireOnTick();

    expect(fetcher.fetchTriggersForRunCancellation).toHaveBeenCalledTimes(1);
    expect(runner.abortTriggerRuns).toHaveBeenCalledWith([trigger]);
  });
});
