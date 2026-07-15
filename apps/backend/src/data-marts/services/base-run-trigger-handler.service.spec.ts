import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { Trigger } from '../../common/scheduler/shared/entities/trigger.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { BaseRunTriggerHandlerService } from './base-run-trigger-handler.service';
import { DataMartRunService } from './data-mart-run.service';

class TestRunTrigger extends Trigger {
  dataMartRunId: string;
}

class TestRunTriggerHandler extends BaseRunTriggerHandlerService<TestRunTrigger> {
  protected readonly logger = new Logger(TestRunTriggerHandler.name);

  constructor(
    repository: Repository<DataMartRun>,
    private readonly triggerRepository: Repository<TestRunTrigger>,
    private readonly lifecycle: string[]
  ) {
    super({} as SchedulerFacade, {} as DataMartRunService, repository);
  }

  async runOrphanCleanup(): Promise<void> {
    await (this as unknown as { cleanupOrphanedRuns(): Promise<void> }).cleanupOrphanedRuns();
  }

  async handleTrigger(): Promise<void> {}

  getTriggerRepository(): Repository<TestRunTrigger> {
    return this.triggerRepository;
  }

  processingCronExpression(): string {
    return '* * * * * *';
  }

  stuckTriggerTimeoutSeconds(): number {
    return 60;
  }

  triggerTtlSeconds(): number {
    return 60;
  }

  protected getRunTypes(): string[] {
    return [DataMartRunType.CONNECTOR];
  }

  protected getTriggerEntityClass(): new () => TestRunTrigger {
    return TestRunTrigger;
  }

  protected getTriggerRunIdField(): string {
    return 'dataMartRunId';
  }

  protected override async onOrphanedRunFailed(): Promise<void> {
    this.lifecycle.push('hook');
  }
}

describe('BaseRunTriggerHandlerService orphan cleanup', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the default policy PENDING-only and persists finishedAt after dependent hooks', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T10:00:00.000Z'));
    const lifecycle: string[] = [];
    const run = Object.assign(new DataMartRun(), {
      id: 'run-1',
      status: DataMartRunStatus.PENDING,
      type: DataMartRunType.CONNECTOR,
      createdAt: new Date('2026-07-16T09:00:00.000Z'),
      finishedAt: null,
      errors: [],
    });
    const queryBuilder = {
      leftJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getMany: jest.fn().mockResolvedValue([run]),
    };
    Object.values(queryBuilder).forEach(mock => mock.mockReturnValue(queryBuilder));
    queryBuilder.getMany.mockResolvedValue([run]);
    const repository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      save: jest.fn(async value => {
        lifecycle.push('save');
        return value;
      }),
    } as unknown as Repository<DataMartRun>;
    const handler = new TestRunTriggerHandler(
      repository,
      {} as Repository<TestRunTrigger>,
      lifecycle
    );

    await handler.runOrphanCleanup();

    expect(queryBuilder.where).toHaveBeenCalledWith('run.status IN (:...statuses)', {
      statuses: [DataMartRunStatus.PENDING],
    });
    expect(lifecycle).toEqual(['hook', 'save']);
    expect(run).toMatchObject({
      status: DataMartRunStatus.FAILED,
      finishedAt: new Date('2026-07-16T10:00:00.000Z'),
    });
  });
});
