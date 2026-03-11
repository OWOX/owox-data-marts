import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { ConcurrencyLimitExceededException } from '../../common/exceptions/concurrency-limit-exceeded.exception';
import { ReportRunTrigger } from '../entities/report-run-trigger.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { RunReportService } from '../use-cases/run-report.service';

const REPORT_RUN_TYPES = [
  DataMartRunType.GOOGLE_SHEETS_EXPORT,
  DataMartRunType.LOOKER_STUDIO,
  DataMartRunType.EMAIL,
  DataMartRunType.SLACK,
  DataMartRunType.MS_TEAMS,
  DataMartRunType.GOOGLE_CHAT,
];

@Injectable()
export class ReportRunTriggerHandlerService
  implements TriggerHandler<ReportRunTrigger>, OnModuleInit
{
  private readonly logger = new Logger(ReportRunTriggerHandlerService.name);

  constructor(
    @InjectRepository(ReportRunTrigger)
    private readonly repository: Repository<ReportRunTrigger>,
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly runReportService: RunReportService,
    private readonly configService: ConfigService
  ) {}

  async handleTrigger(
    trigger: ReportRunTrigger,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    try {
      await this.checkProjectReportConcurrencyLimit(trigger.projectId);

      this.logger.log(
        `Executing report run for report ${trigger.reportId}, dataMartRunId ${trigger.dataMartRunId}`
      );

      await this.runReportService.executeExistingRun(trigger.dataMartRunId!, options?.signal);
    } catch (error) {
      if (error instanceof ConcurrencyLimitExceededException) {
        this.logger.warn(
          `Report concurrency limit reached for project ${trigger.projectId}, trigger ${trigger.id} will retry`
        );
        trigger.status = TriggerStatus.IDLE;
        trigger.isActive = true;
        await this.repository.save(trigger);
        return;
      }
      throw error;
    }
  }

  private async checkProjectReportConcurrencyLimit(projectId: string): Promise<void> {
    const maxRuns = this.configService.get<number>('MAX_REPORT_RUNS_PER_PROJECT', 3);

    const activeCount = await this.dataMartRunRepository
      .createQueryBuilder('run')
      .innerJoin('run.dataMart', 'dm')
      .where('dm.projectId = :projectId', { projectId })
      .andWhere('run.status IN (:...statuses)', {
        statuses: [DataMartRunStatus.RUNNING],
      })
      .andWhere('run.type IN (:...types)', { types: REPORT_RUN_TYPES })
      .getCount();

    if (activeCount >= maxRuns) {
      throw new ConcurrencyLimitExceededException(
        `Project ${projectId} has reached the limit of ${maxRuns} concurrent report runs`
      );
    }
  }

  getTriggerRepository(): Repository<ReportRunTrigger> {
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
