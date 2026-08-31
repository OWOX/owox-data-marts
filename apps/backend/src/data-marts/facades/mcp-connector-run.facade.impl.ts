import { Injectable } from '@nestjs/common';
import { RunDataMartService } from '../use-cases/run-data-mart.service';
import { GetDataMartRunService } from '../use-cases/get-data-mart-run.service';
import { RunDataMartCommand } from '../dto/domain/run-data-mart.command';
import { GetDataMartRunCommand } from '../dto/domain/get-data-mart-run.command';
import { RunType } from '../../common/scheduler/shared/types';
import {
  McpConnectorRunFacade,
  McpRunConnectorDataMartRequest,
  McpRunConnectorDataMartResult,
  McpGetRunStatusRequest,
  McpGetRunStatusResult,
} from './mcp-connector-run.facade';

@Injectable()
export class McpConnectorRunFacadeImpl implements McpConnectorRunFacade {
  constructor(
    private readonly runDataMartService: RunDataMartService,
    private readonly getDataMartRunService: GetDataMartRunService
  ) {}

  async runConnectorDataMart(
    request: McpRunConnectorDataMartRequest
  ): Promise<McpRunConnectorDataMartResult> {
    const runId = await this.runDataMartService.run(
      new RunDataMartCommand(
        request.dataMartId,
        request.projectId,
        request.userId,
        RunType.manual,
        undefined,
        request.roles
      )
    );
    return { runId, status: 'PENDING' };
  }

  async getConnectorRunStatus(request: McpGetRunStatusRequest): Promise<McpGetRunStatusResult> {
    const run = await this.getDataMartRunService.run(
      new GetDataMartRunCommand(
        request.dataMartId,
        request.projectId,
        request.runId,
        request.userId,
        request.roles
      )
    );
    return {
      runId: run.id,
      dataMartId: run.dataMartId,
      status: String(run.status),
      runType: String(run.runType),
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      lastLogs: (run.logs ?? []).slice(-50),
      errors: run.errors ?? [],
    };
  }
}
