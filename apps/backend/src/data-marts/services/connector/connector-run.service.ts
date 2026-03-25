import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import { ConnectorExecutionError } from '../../errors/connector-execution.error';
import { RunType } from '../../../common/scheduler/shared/types';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { ConnectorRunTriggerService } from './connector-run-trigger.service';
import { ConnectorExecutorService } from './connector-executor.service';

@Injectable()
export class ConnectorRunService {
  private readonly logger = new Logger(ConnectorRunService.name);

  constructor(
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    private readonly connectorRunTriggerService: ConnectorRunTriggerService,
    private readonly connectorExecutorService: ConnectorExecutorService,
    private readonly systemTimeService: SystemTimeService
  ) {}

  async cancelRun(dataMartId: string, runId: string): Promise<void> {
    const run = await this.dataMartRunRepository.findOne({
      where: { id: runId, dataMartId },
    });

    if (!run) {
      throw new ConnectorExecutionError('Data mart run not found', undefined, {
        dataMartId,
        runId,
      });
    }

    if (run.status === DataMartRunStatus.SUCCESS || run.status === DataMartRunStatus.FAILED) {
      throw new ConnectorExecutionError('Cannot cancel completed data mart run', undefined, {
        dataMartId,
        runId,
        projectId: run?.dataMart?.projectId,
      });
    }

    if (run.status === DataMartRunStatus.CANCELLED) {
      throw new ConnectorExecutionError('Data mart run is already cancelled', undefined, {
        dataMartId,
        runId,
        projectId: run?.dataMart?.projectId,
      });
    }

    if (run.status === DataMartRunStatus.PENDING || run.status === DataMartRunStatus.RUNNING) {
      await this.dataMartRunRepository.update(runId, {
        status: DataMartRunStatus.CANCELLED,
        finishedAt: this.systemTimeService.now(),
      });
    }
  }

  @Transactional()
  async run(
    dataMart: DataMart,
    createdById: string,
    runType: RunType,
    payload?: Record<string, unknown>
  ): Promise<string> {
    this.validateDataMartForConnector(dataMart);
    const isRunning = await this.checkDataMartIsRunning(dataMart);
    if (isRunning) {
      throw new BusinessViolationException(
        'Connector is already running. Please wait until it finishes'
      );
    }

    const dataMartRun = await this.createDataMartRun(dataMart, createdById, runType, payload);

    await this.connectorRunTriggerService.createTrigger({
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
      createdById,
      dataMartRunId: dataMartRun.id,
      runType,
      payload,
    });

    return dataMartRun.id;
  }

  async executeExistingRun(
    dataMart: DataMart,
    run: DataMartRun,
    payload?: Record<string, unknown> | null,
    _signal?: AbortSignal
  ): Promise<void> {
    return this.connectorExecutorService.executeInBackground(dataMart, run, payload);
  }

  async getDataMartConnectorRunsByStatus(status: DataMartRunStatus): Promise<DataMartRun[]> {
    const runs = await this.dataMartRunRepository.find({
      where: { status },
      relations: ['dataMart', 'dataMart.storage', 'dataMart.storage.credential'],
    });
    return runs.filter(run => run.type === DataMartRunType.CONNECTOR);
  }

  async executeInterruptedRuns(): Promise<void> {
    const interruptedRuns = await this.getDataMartConnectorRunsByStatus(
      DataMartRunStatus.INTERRUPTED
    );
    if (interruptedRuns.length === 0) {
      this.logger.log('No interrupted runs found to resume');
      return;
    }

    this.logger.log(`Scheduling ${interruptedRuns.length} interrupted runs for resumption...`);

    for (const run of interruptedRuns) {
      try {
        await this.dataMartRunRepository.update(run.id, {
          status: DataMartRunStatus.PENDING,
        });

        await this.connectorRunTriggerService.createTrigger({
          dataMartId: run.dataMartId,
          projectId: run.dataMart.projectId,
          createdById: run.createdById ?? 'system',
          dataMartRunId: run.id,
          runType: run.runType,
          payload: run.additionalParams ?? undefined,
        });

        this.logger.log(`Created trigger for interrupted run ${run.id}`, {
          dataMartId: run.dataMartId,
          projectId: run.dataMart.projectId,
          runId: run.id,
        });
      } catch (error) {
        this.logger.error(
          `Failed to schedule interrupted run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
          { dataMartId: run.dataMartId, projectId: run.dataMart.projectId, runId: run.id }
        );
      }
    }
  }

  private validateDataMartForConnector(dataMart: DataMart): void {
    if (dataMart.definitionType !== DataMartDefinitionType.CONNECTOR) {
      throw new ConnectorExecutionError('DataMart is not a connector type', undefined, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
      });
    }
    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new ConnectorExecutionError('DataMart is not published', undefined, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
      });
    }
  }

  private async checkDataMartIsRunning(dataMart: DataMart): Promise<boolean> {
    const dataMartRun = await this.dataMartRunRepository.findOne({
      where: {
        dataMartId: dataMart.id,
        status: In([DataMartRunStatus.RUNNING, DataMartRunStatus.PENDING]),
        type: DataMartRunType.CONNECTOR,
      },
    });
    return !!dataMartRun;
  }

  private async createDataMartRun(
    dataMart: DataMart,
    createdById: string,
    runType: RunType,
    payload?: Record<string, unknown>
  ): Promise<DataMartRun> {
    const dataMartRun = this.dataMartRunRepository.create({
      dataMartId: dataMart.id,
      type: DataMartRunType.CONNECTOR,
      definitionRun: dataMart.definition,
      status: DataMartRunStatus.PENDING,
      createdById,
      runType,
      logs: [],
      errors: [],
      additionalParams: payload ? { payload } : undefined,
    });
    return this.dataMartRunRepository.save(dataMartRun);
  }
}
