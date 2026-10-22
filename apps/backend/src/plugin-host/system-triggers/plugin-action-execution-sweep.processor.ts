import { Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { SystemTrigger } from '../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../common/scheduler/system-tasks/system-trigger-type';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import { PluginActionExecutionService } from '../services/plugin-action-execution.service';
import { PluginActionQueueService } from '../services/plugin-action-queue.service';
import { PluginActionScheduleService } from '../services/plugin-action-schedule.service';

const CRON = '* * * * *';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Ends executions whose dispatching replica died or that waited too long in the queue, applies execution retention, gives stranded schedules a slot, and starts queued executions. */
@Injectable()
export class PluginActionExecutionSweepProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(PluginActionExecutionSweepProcessor.name);

  constructor(
    private readonly executions: PluginActionExecutionService,
    private readonly queue: PluginActionQueueService,
    private readonly schedules: PluginActionScheduleService,
    private readonly config: PluginHostConfigService
  ) {
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
    const failures: unknown[] = [];
    // Each step runs whatever an earlier one threw: the sweep alone promotes a queue whose runs all wait.
    const step = async <T>(name: string, run: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await run();
      } catch (error) {
        this.logger.error(`Plugin action sweep step ${name} failed`, castError(error).stack);
        failures.push(error);
        return undefined;
      }
    };

    const timedOut = await step('timeOutOrphans', () =>
      this.executions.timeOutOrphans(new Date(now - PLUGIN_ACTION_LIMITS.orphanGraceMs))
    );
    const expired = await step('timeOutQueued', () =>
      this.executions.timeOutQueued(
        new Date(now - PLUGIN_ACTION_LIMITS.queuedMaxAgeHours * HOUR_MS)
      )
    );
    await step('clearPayloads', () =>
      this.executions.clearPayloads(
        new Date(now - PLUGIN_ACTION_LIMITS.payloadRetentionHours * HOUR_MS),
        options?.signal
      )
    );
    await step('deleteFinished', () =>
      this.executions.deleteFinished(
        new Date(now - PLUGIN_ACTION_LIMITS.rowRetentionDays * DAY_MS),
        options?.signal
      )
    );

    if (timedOut) {
      this.logger.warn(
        `${timedOut} plugin action executions outlived the replica that dispatched them and were marked TIMED_OUT`
      );
    }
    if (expired) {
      this.logger.warn(
        `${expired} queued plugin action executions waited ${PLUGIN_ACTION_LIMITS.queuedMaxAgeHours} hours and were marked TIMED_OUT`
      );
    }
    await step('unparkStranded', () =>
      this.schedules.unparkStranded(new Date(now), PLUGIN_ACTION_LIMITS.sweepBatchSize)
    );
    // Last: each promotion calls the IDP and the validation pool, which must not hold back the maintenance.
    await step('promoteQueued', () => this.promoteQueued(options?.signal));
    // The system trigger still records the failure.
    if (failures.length > 0) {
      throw failures[0];
    }
  }

  /** Every installation with queued executions, a page at a time in id order, until a short page or an abort. */
  private async promoteQueued(signal?: AbortSignal): Promise<void> {
    const pageSize = this.config.queueSweepInstallations;
    let after: string | undefined;
    for (;;) {
      const page = await this.executions.findInstallationsWithQueued(pageSize, after);
      // One at a time: each promotion calls the IDP and the shared validation pool.
      for (const installationId of page) {
        if (signal?.aborted) return;
        await this.queue.promote(installationId);
      }
      if (page.length < pageSize || signal?.aborted) return;
      after = page[page.length - 1];
    }
  }
}
