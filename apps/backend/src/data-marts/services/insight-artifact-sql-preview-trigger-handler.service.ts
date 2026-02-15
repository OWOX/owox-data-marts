import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { RunInsightArtifactSqlPreviewCommand } from '../dto/domain/run-insight-artifact-sql-preview.command';
import { InsightArtifactSqlPreviewTrigger } from '../entities/insight-artifact-sql-preview-trigger.entity';
import { RunInsightArtifactSqlPreviewService } from '../use-cases/run-insight-artifact-sql-preview.service';

@Injectable()
export class InsightArtifactSqlPreviewTriggerHandlerService
  implements TriggerHandler<InsightArtifactSqlPreviewTrigger>, OnModuleInit
{
  private readonly logger = new Logger(InsightArtifactSqlPreviewTriggerHandlerService.name);

  constructor(
    @InjectRepository(InsightArtifactSqlPreviewTrigger)
    private readonly repository: Repository<InsightArtifactSqlPreviewTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly runInsightArtifactSqlPreviewService: RunInsightArtifactSqlPreviewService
  ) {}

  async handleTrigger(
    trigger: InsightArtifactSqlPreviewTrigger,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    try {
      if (options?.signal?.aborted) {
        this.logger.debug(`Trigger ${trigger.id} was cancelled before processing`);
        return;
      }

      const response = await this.runInsightArtifactSqlPreviewService.run(
        new RunInsightArtifactSqlPreviewCommand(
          trigger.insightArtifactId,
          trigger.dataMartId,
          trigger.projectId,
          trigger.sql ?? undefined
        )
      );

      trigger.uiResponse = {
        columns: response.columns,
        rows: response.rows,
        rowCount: response.rowCount,
        limit: response.limit,
      };
      trigger.onSuccess();
      await this.repository.save(trigger);
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      this.logger.error(
        `Error processing Insight Artifact SQL preview trigger ${trigger.id}: ${error}`
      );
      trigger.uiResponse = { error };
      trigger.onError();
      await this.repository.save(trigger);
    }
  }

  getTriggerRepository(): Repository<InsightArtifactSqlPreviewTrigger> {
    return this.repository;
  }

  processingCronExpression(): string {
    return '*/2 * * * * *';
  }

  stuckTriggerTimeoutSeconds(): number {
    return 60 * 60;
  }

  triggerTtlSeconds(): number {
    return 60 * 60 * 3;
  }

  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
  }
}
