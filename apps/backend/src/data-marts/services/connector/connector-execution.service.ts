import { Injectable } from '@nestjs/common';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { RunType } from '../../../common/scheduler/shared/types';
import { ConnectorRunService } from './connector-run.service';

/**
 * Thin facade for backward compatibility.
 * Delegates all operations to ConnectorRunService.
 */
@Injectable()
export class ConnectorExecutionService {
  constructor(private readonly connectorRunService: ConnectorRunService) {}

  async run(
    dataMart: DataMart,
    createdById: string,
    runType: RunType,
    payload?: Record<string, unknown>
  ): Promise<string> {
    return this.connectorRunService.run(dataMart, createdById, runType, payload);
  }

  async cancelRun(dataMartId: string, runId: string): Promise<void> {
    return this.connectorRunService.cancelRun(dataMartId, runId);
  }

  async executeExistingRun(
    dataMart: DataMart,
    run: DataMartRun,
    payload?: Record<string, unknown> | null,
    signal?: AbortSignal
  ): Promise<void> {
    return this.connectorRunService.executeExistingRun(dataMart, run, payload, signal);
  }

  async executeInterruptedRuns(): Promise<void> {
    return this.connectorRunService.executeInterruptedRuns();
  }

  async getDataMartConnectorRunsByStatus(status: DataMartRunStatus): Promise<DataMartRun[]> {
    return this.connectorRunService.getDataMartConnectorRunsByStatus(status);
  }
}
