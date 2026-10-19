import { Injectable } from '@nestjs/common';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import type {
  DataMartExecutionRunDto,
  DataMartLoadScheduleDto,
} from '../facades/mcp-data-mart-execution.facade';
import {
  readBackfillChainMeta,
  readBackfillRange,
  unwrapRunPayload,
} from '../utils/manual-backfill-range';

@Injectable()
export class McpDataMartExecutionMapper {
  toRun(run: DataMartRun, currentConfigurationRevision: number): DataMartExecutionRunDto {
    const body = unwrapRunPayload(run.additionalParams);
    const connector = run.type === DataMartRunType.CONNECTOR;
    const storedRevision = run.additionalParams?.configurationRevision;
    const configurationRevision =
      typeof storedRevision === 'number' &&
      Number.isSafeInteger(storedRevision) &&
      storedRevision > 0
        ? storedRevision
        : null;
    return {
      configurationRevision,
      currentConfigurationRevision,
      configurationCurrent:
        configurationRevision === null
          ? null
          : configurationRevision === currentConfigurationRevision,
      id: run.id,
      dataMartId: run.dataMartId,
      type: run.type,
      status: run.status,
      runType: run.runType,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
      diagnostics: {
        logsAvailable: Boolean(run.logs?.length),
        errorsAvailable: Boolean(run.errors?.length),
        content: 'withheld',
      },
      load: connector
        ? {
            runType:
              body.runType === 'INCREMENTAL' || body.runType === 'MANUAL_BACKFILL'
                ? body.runType
                : null,
            dateRange: readBackfillRange(body) ?? null,
          }
        : null,
      backfillChain: connector ? (readBackfillChainMeta(run.additionalParams) ?? null) : null,
    };
  }

  toSchedule(trigger: DataMartScheduledTrigger, revision: number): DataMartLoadScheduleDto {
    return {
      id: trigger.id,
      cronExpression: trigger.cronExpression,
      timeZone: trigger.timeZone,
      enabled: trigger.isActive,
      nextRunAt: trigger.nextRunTimestamp?.toISOString() ?? null,
      revision,
      // ScheduledConnectorRunProcessor passes no payload; runtime configuration stays in the app.
      loadParameters: { mode: 'connector-default', configurable: false },
      recurringEffect:
        'Each enabled occurrence starts a connector load and may consume billable resources.',
    };
  }
}
