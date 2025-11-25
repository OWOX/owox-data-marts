import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OwoxProducer } from '@owox/internal-helpers';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { RunType } from '../../common/scheduler/shared/types';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMart } from '../entities/data-mart.entity';
import { Insight } from '../entities/insight.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { InsightRunSuccessfullyEvent } from '../events/insight-run-successfully.event';
import { DataMartRunService } from './data-mart-run.service';

@Injectable()
export class InsightExecutionService {
  private readonly logger = new Logger(InsightExecutionService.name);

  constructor(
    private readonly dataMartRunService: DataMartRunService,
    @InjectRepository(Insight)
    private readonly insightRepository: Repository<Insight>,
    private readonly systemTimeService: SystemTimeService,
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer
  ) {}

  async run(
    dataMart: DataMart,
    insight: Insight,
    createdById: string,
    runType: RunType
  ): Promise<string> {
    this.validateDataMartForInsight(dataMart);
    const isRunning = await this.dataMartRunService.isInsightRunning(insight.id);
    if (isRunning) {
      throw new BusinessViolationException(
        'Insight is already running. Please wait until it finishes'
      );
    }

    const dataMartRun = await this.createRun(dataMart, insight, createdById, runType);

    await this.execute(dataMart, insight, dataMartRun).catch(error => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Insight execution failed: ${errorMessage}`, error?.stack, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId: dataMartRun.id,
      });
    });

    return dataMartRun.id;
  }

  private validateDataMartForInsight(dataMart: DataMart): void {
    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new BusinessViolationException('DataMart is not published');
    }
  }

  private async createRun(
    dataMart: DataMart,
    insight: Insight,
    createdById: string,
    runType: RunType
  ): Promise<DataMartRun> {
    return this.dataMartRunService.createAndMarkInsightRunAsPending(dataMart, insight, {
      createdById,
      runType,
    });
  }

  private async execute(dataMart: DataMart, insight: Insight, run: DataMartRun) {
    const runId = run.id;
    await this.dataMartRunService.markInsightRunAsStarted(run);

    const logs: string[] = [];
    const errors: string[] = [];
    let generatedOutput: string | null = null;

    const pushLog = (message: Record<string, unknown>) => {
      const enriched = {
        at: this.systemTimeService.now(),
        ...message,
      };
      logs.push(JSON.stringify(enriched));
    };

    //TODO: Replace with actual insight AI layer execution
    const runMain = async (): Promise<string> => {
      // TODO: delete this after implementation
      await new Promise(resolve => setTimeout(resolve, 10000));
      pushLog({ type: 'log', message: `Job started for ${insight.title}` });
      pushLog({
        type: 'log',
        message: 'Collected data for requested Insight (stubbed)',
      });
      pushLog({ type: 'isInProgress', status: 'in_progress' });
      pushLog({
        type: 'log',
        message: 'Validated data integrity; handled missing values (stubbed)',
      });
      pushLog({ type: 'log', message: 'Computed metrics and benchmarks (stubbed)' });
      pushLog({ type: 'log', message: 'Compiled executive summary and recommendations (stubbed)' });

      const output = insight.template ?? null;

      return output ?? '';
    };

    try {
      generatedOutput = await runMain();

      await this.dataMartRunService.markInsightRunAsFinished(run, {
        status: DataMartRunStatus.SUCCESS,
        logs,
        errors,
      });

      await this.producer.produceEvent(
        new InsightRunSuccessfullyEvent(
          dataMart.id,
          runId,
          dataMart.projectId,
          run.createdById!,
          run.runType!
        )
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(
        JSON.stringify({
          type: 'error',
          at: this.systemTimeService.now(),
          error: message,
        })
      );
      await this.dataMartRunService.markInsightRunAsFinished(run, {
        status: DataMartRunStatus.FAILED,
        logs,
        errors,
      });
      this.logger.error(`Insight run failed: ${message}`, (e as Error)?.stack, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId,
      });
    } finally {
      const updatePayload: Record<string, unknown> = {
        lastManualDataMartRunId: run.id,
      };
      if (generatedOutput !== null) {
        updatePayload.output = generatedOutput;
        updatePayload.outputUpdatedAt = this.systemTimeService.now();
      }
      await this.insightRepository.update(insight.id, updatePayload);
    }
  }
}
