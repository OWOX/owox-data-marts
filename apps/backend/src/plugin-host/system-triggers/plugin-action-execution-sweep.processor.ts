import { Injectable, Logger } from '@nestjs/common';
import { SystemTrigger } from '../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../common/scheduler/system-tasks/system-trigger-type';
import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import { PluginActionExecutionService } from '../services/plugin-action-execution.service';

const CRON = '* * * * *';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Ends executions whose dispatching replica died, and applies execution retention. */
@Injectable()
export class PluginActionExecutionSweepProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(PluginActionExecutionSweepProcessor.name);

  constructor(private readonly executions: PluginActionExecutionService) {
    super();
  }

  getType(): SystemTriggerType {
    return SystemTriggerType.PLUGIN_ACTION_EXECUTION_SWEEP;
  }

  getDefaultCron(): string {
    return CRON;
  }

  async process(_trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    const now = Date.now();

    const timedOut = await this.executions.timeOutOrphans(
      new Date(now - PLUGIN_ACTION_LIMITS.orphanGraceMs)
    );
    await this.executions.clearPayloads(
      new Date(now - PLUGIN_ACTION_LIMITS.payloadRetentionHours * HOUR_MS),
      options?.signal
    );
    await this.executions.deleteFinished(
      new Date(now - PLUGIN_ACTION_LIMITS.rowRetentionDays * DAY_MS),
      options?.signal
    );

    if (timedOut > 0) {
      this.logger.warn(
        `${timedOut} plugin action executions outlived the replica that dispatched them and were marked TIMED_OUT`
      );
    }
  }
}
