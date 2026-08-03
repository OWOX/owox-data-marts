import { Injectable, Logger } from '@nestjs/common';
import { SystemTrigger } from '../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../common/scheduler/system-tasks/system-trigger-type';
import { PluginUpdateScheduleService } from '../services/plugin-update-schedule.service';
import { RunPluginUpdateCheckService } from '../use-cases/run-plugin-update-check.service';

/** Matches the five-minute slots the schedule hands out. */
const CRON = '*/5 * * * *';

/**
 * Plugins checked per wake-up.
 *
 * A cap on GitHub traffic per pass, not on coverage: a plugin left over stays due and is
 * picked up on the next wake-up, five minutes later.
 */
const BATCH_LIMIT = 50;

/**
 * Daily managed update checking.
 *
 * Mandatory in Cloud and self-managed alike -- there is no configuration that turns a
 * deployment into manual-only updates. What the deployment does have is
 * SCHEDULER_EXECUTION_ENABLED, which decides whether an instance is a worker at all; API
 * instances register this handler without running it, exactly like every other system
 * task.
 */
@Injectable()
export class PluginUpdateCheckProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(PluginUpdateCheckProcessor.name);

  constructor(
    private readonly schedule: PluginUpdateScheduleService,
    private readonly check: RunPluginUpdateCheckService
  ) {
    super();
  }

  getType(): SystemTriggerType {
    return SystemTriggerType.PLUGIN_UPDATE_CHECK;
  }

  getDefaultCron(): string {
    return CRON;
  }

  async process(_trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    const now = new Date();
    const due = await this.schedule.listDue(now, BATCH_LIMIT);

    if (due.length === BATCH_LIMIT) {
      this.logger.log(
        `Checked ${BATCH_LIMIT} plugins this pass; any remaining stay due and follow in the next one`
      );
    }

    for (const plugin of due) {
      if (options?.signal?.aborted) {
        break;
      }

      // Nothing publishes or installs it any more, so nobody depends on it being
      // current. Publishing, installing or restoring it puts it back on the schedule.
      if (!(await this.schedule.isUnderMaintenance(plugin.id))) {
        await this.schedule.dropFromSchedule(plugin.id);
        continue;
      }

      const result = await this.check.run(plugin, 'automatic');
      // Rescheduled whatever the outcome: a failed check waits for tomorrow's slot
      // rather than retrying in a loop against a GitHub that is already refusing us.
      await this.schedule.reschedule(plugin.id, new Date());

      if (result.outcome === 'updated') {
        this.logger.log(`${result.repository} is now current on ${result.currentSemver}`);
      }
    }
  }
}
