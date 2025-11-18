import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OwoxProducer } from '@owox/internal-helpers';
import { Repository } from 'typeorm';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { RunType } from '../../common/scheduler/shared/types';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMart } from '../entities/data-mart.entity';
import { Insight } from '../entities/insight.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { InsightRunSuccessfullyEvent } from '../events/insight-run-successfully.event';

@Injectable()
export class InsightExecutionService {
  private readonly logger = new Logger(InsightExecutionService.name);

  constructor(
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
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
    const dataMartRun = await this.createRun(dataMart, insight, createdById, runType);

    this.executeInBackground(dataMart, insight, dataMartRun).catch(error => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Background insight execution failed: ${errorMessage}`, error?.stack, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId: dataMartRun.id,
      });
    });

    return dataMartRun.id;
  }

  private async createRun(
    dataMart: DataMart,
    insight: Insight,
    createdById: string,
    runType: RunType
  ): Promise<DataMartRun> {
    const run = this.dataMartRunRepository.create({
      dataMartId: dataMart.id,
      type: DataMartRunType.INSIGHT,
      status: DataMartRunStatus.PENDING,
      createdById,
      runType,
      insightId: insight.id,
      definitionRun: {
        insight: {
          title: insight.title,
          template: insight.template ?? null,
        },
      },
      logs: [],
      errors: [],
    });
    return this.dataMartRunRepository.save(run);
  }

  private async executeInBackground(dataMart: DataMart, insight: Insight, run: DataMartRun) {
    const runId = run.id;
    const now = this.systemTimeService.now();
    await this.dataMartRunRepository.update(runId, {
      status: DataMartRunStatus.RUNNING,
      startedAt: now,
      finishedAt: undefined,
    });

    const logs: string[] = [];
    const errors: string[] = [];

    const pushLog = (message: Record<string, unknown>) => {
      const enriched = {
        at: this.systemTimeService.now(),
        ...message,
      };
      logs.push(JSON.stringify(enriched));
    };

    const runMain = async (): Promise<string> => {
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

      const output =
        'Executive summary: This is a stubbed output for the Insight execution. Replace with AI Layer output when available.\n\n' +
        `Title: ${insight.title}\n` +
        (insight.template ? `Template: ${insight.template}\n` : '');

      return output;
    };

    try {
      const output = await runMain();

      await this.insightRepository.update(insight.id, {
        output,
        outputUpdatedAt: this.systemTimeService.now(),
      });

      await this.dataMartRunRepository.update(runId, {
        status: DataMartRunStatus.SUCCESS,
        finishedAt: this.systemTimeService.now(),
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
      await this.dataMartRunRepository.update(runId, {
        status: DataMartRunStatus.FAILED,
        finishedAt: this.systemTimeService.now(),
        logs,
        errors,
      });
      this.logger.error(`Insight run failed: ${message}`, (e as Error)?.stack, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId,
      });
    }
  }
}
