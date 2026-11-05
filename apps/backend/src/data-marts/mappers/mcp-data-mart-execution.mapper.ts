import { Injectable } from '@nestjs/common';
import { DataMartRunDto } from '../dto/domain/data-mart-run.dto';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { readBackfillChainMeta } from '../utils/manual-backfill-range';
import {
  McpDataMartRunSummary,
  McpDataMartSchedule,
} from '../facades/mcp-data-mart-execution.facade';
import { DATA_MART_RUN_ERROR_MESSAGES } from '../errors/data-mart-error-messages';

const SAFE_RUN_ERRORS = new Set<string>([
  DATA_MART_RUN_ERROR_MESSAGES.CONCURRENCY_LIMIT_REACHED,
  DATA_MART_RUN_ERROR_MESSAGES.CONNECTOR_DEFINITION_CHANGED,
]);

@Injectable()
export class McpDataMartExecutionMapper {
  toRun(dto: DataMartRunDto): McpDataMartRunSummary {
    const chain = readBackfillChainMeta(dto.additionalParams);
    return {
      runId: dto.id,
      dataMartId: dto.dataMartId,
      status: dto.status,
      type: dto.type,
      runType: dto.runType,
      createdAt: dto.createdAt.toISOString(),
      startedAt: dto.startedAt?.toISOString() ?? null,
      finishedAt: dto.finishedAt?.toISOString() ?? null,
      errorSummary: this.errorSummary(dto),
      ...(chain
        ? {
            backfill: {
              chainId: chain.id,
              segmentIndex: chain.segmentIndex,
              segmentsTotal: chain.segmentsTotal,
            },
          }
        : {}),
      shouldPoll:
        dto.status === DataMartRunStatus.PENDING || dto.status === DataMartRunStatus.RUNNING,
    };
  }
  private errorSummary(dto: DataMartRunDto): string | null {
    const known = dto.errors?.slice(0, 20).find(error => SAFE_RUN_ERRORS.has(error));
    if (known) return `${known} Open Run History in OWOX for details.`;
    if (dto.status === DataMartRunStatus.FAILED) {
      return 'The run failed. Open its Run History in OWOX to see details.';
    }
    if (dto.status === DataMartRunStatus.RESTRICTED) {
      return 'The run was restricted. Open its Run History in OWOX to see details.';
    }
    return dto.errors?.length ? 'Open Run History in OWOX to inspect the run errors.' : null;
  }
  toSchedule(dto: ScheduledTriggerDto, dataMartId: string): McpDataMartSchedule {
    return {
      dataMartId,
      triggerId: dto.id,
      cronExpression: dto.cronExpression,
      timeZone: dto.timeZone,
      isActive: dto.isActive,
      nextRunAt: dto.nextRunTimestamp?.toISOString() ?? null,
      lastRunAt: dto.lastRunTimestamp?.toISOString() ?? null,
    };
  }
}
