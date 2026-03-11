import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { ConcurrencyLimitExceededException } from '../../common/exceptions/concurrency-limit-exceeded.exception';
import { ConnectorRunTrigger } from '../entities/connector-run-trigger.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { ConnectorExecutionService } from './connector-execution.service';
import { DataMartService } from './data-mart.service';

@Injectable()
export class ConnectorRunTriggerHandlerService
  implements TriggerHandler<ConnectorRunTrigger>, OnModuleInit
{
  private readonly logger = new Logger(ConnectorRunTriggerHandlerService.name);

  constructor(
    @InjectRepository(ConnectorRunTrigger)
    private readonly repository: Repository<ConnectorRunTrigger>,
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly connectorExecutionService: ConnectorExecutionService,
    private readonly dataMartService: DataMartService,
    private readonly configService: ConfigService
  ) {}

  async handleTrigger(trigger: ConnectorRunTrigger): Promise<void> {
    try {
      await this.checkProjectConcurrencyLimit(trigger.projectId);

      const dataMart = await this.dataMartService.getByIdAndProjectId(
        trigger.dataMartId,
        trigger.projectId
      );
      const run = await this.dataMartRunRepository.findOneOrFail({
        where: { id: trigger.dataMartRunId },
      });

      this.logger.log(`Executing connector run ${run.id} for data mart ${trigger.dataMartId}`);

      await this.connectorExecutionService.executeExistingRun(dataMart, run, trigger.payload);
    } catch (error) {
      if (error instanceof ConcurrencyLimitExceededException) {
        this.logger.warn(
          `Concurrency limit reached for project ${trigger.projectId}, trigger ${trigger.id} will retry`
        );
        trigger.status = TriggerStatus.IDLE;
        trigger.isActive = true;
        await this.repository.save(trigger);
        return;
      }
      throw error;
    }
  }

  private async checkProjectConcurrencyLimit(projectId: string): Promise<void> {
    const maxRuns = this.configService.get<number>('MAX_CONNECTOR_RUNS_PER_PROJECT', 3);

    const activeCount = await this.dataMartRunRepository
      .createQueryBuilder('run')
      .innerJoin('run.dataMart', 'dm')
      .where('dm.projectId = :projectId', { projectId })
      .andWhere('run.status IN (:...statuses)', {
        statuses: [DataMartRunStatus.RUNNING],
      })
      .andWhere('run.type = :type', { type: DataMartRunType.CONNECTOR })
      .getCount();

    if (activeCount >= maxRuns) {
      throw new ConcurrencyLimitExceededException(
        `Project ${projectId} has reached the limit of ${maxRuns} concurrent connector runs`
      );
    }
  }

  getTriggerRepository(): Repository<ConnectorRunTrigger> {
    return this.repository;
  }

  processingCronExpression(): string {
    return '*/5 * * * * *';
  }

  stuckTriggerTimeoutSeconds(): number {
    return 60 * 60;
  }

  triggerTtlSeconds(): number {
    return 2 * 60 * 60;
  }

  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
  }
}
