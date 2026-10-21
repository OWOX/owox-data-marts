import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { castError } from '@owox/internal-helpers';
import { QueryFailedError, Repository } from 'typeorm';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import type { ProjectMemberDto } from '../../idp/dto/domain/project-member.dto';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { PluginActionSchedule } from '../entities/plugin-action-schedule.entity';
import { PluginScheduleDisabledReason } from '../enums/plugin-action-schedule.enum';
import {
  ActionInputInvalidError,
  ActionInputTooLargeError,
  ActionNotDeclaredError,
  InstallationInactiveError,
  TooManyExecutionsError,
} from '../errors/plugin-action.errors';
import { isOverBudget } from './action-input-validator.service';
import {
  isScheduleNotHeld,
  PluginActionExecutionService,
  scheduleNotHeldError,
} from './plugin-action-execution.service';
import { PluginActionStarterService } from './plugin-action-starter.service';
import { PluginInstallationService } from './plugin-installation.service';
import { PluginOwnerMembershipService } from './plugin-owner-membership.service';
import { PluginVersionService } from './plugin-version.service';
import { PluginService } from './plugin.service';

// The runner logs an error's own properties, and a failed insert carries the parameters and the token hash.
function withoutQuery(error: unknown): unknown {
  if (!(error instanceof QueryFailedError)) {
    return error;
  }
  const { code, errno } = error.driverError as { code?: unknown; errno?: unknown };
  return new QueryFailedError(
    '',
    undefined,
    Object.assign(new Error(error.message), { code, errno })
  );
}

const LOCK_CONFLICTS = new Set<unknown>([
  'ER_LOCK_DEADLOCK',
  1213,
  'ER_LOCK_WAIT_TIMEOUT',
  1205,
  'SQLITE_BUSY',
]);

// Another transaction's lock, not a verdict: the runner would skip the slot, or on a deadlock leave the row PROCESSING.
function isLockConflict(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const { code, errno } = error.driverError as { code?: unknown; errno?: unknown };
  return LOCK_CONFLICTS.has(code) || LOCK_CONFLICTS.has(errno);
}

/** Runs a due schedule as its installation owner; the runner saves what this decides on the trigger. */
@Injectable()
export class PluginActionScheduleHandlerService
  implements TriggerHandler<PluginActionSchedule>, OnModuleInit
{
  private readonly logger = new Logger(PluginActionScheduleHandlerService.name);
  // The runner handles a batch at once, and the validation pool refuses a fifth validation of one version.
  private starts: Promise<unknown> = Promise.resolve();

  constructor(
    @InjectRepository(PluginActionSchedule)
    private readonly repository: Repository<PluginActionSchedule>,
    @Inject(SCHEDULER_FACADE)
    private readonly scheduler: SchedulerFacade,
    private readonly installations: PluginInstallationService,
    private readonly plugins: PluginService,
    private readonly versions: PluginVersionService,
    private readonly executions: PluginActionExecutionService,
    private readonly starter: PluginActionStarterService,
    private readonly owners: PluginOwnerMembershipService,
    private readonly shutdown: GracefulShutdownService,
    private readonly config: PluginHostConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.registerTriggerHandler(this);
  }

  getTriggerRepository(): Repository<PluginActionSchedule> {
    return this.repository;
  }

  processingCronExpression(): string {
    return '* * * * *';
  }

  stuckTriggerTimeoutSeconds(): number {
    return this.config.scheduleStuckSeconds;
  }

  // Starts run one at a time anyway; rows claimed while a batch waits could outlive the stuck timeout.
  waitForBatchCompletion(): boolean {
    return true;
  }

  async handleTrigger(schedule: PluginActionSchedule): Promise<void> {
    const outcome = await this.run(schedule);
    this.logger.log(
      `Plugin schedule ran scheduleId=${schedule.id} installationId=${schedule.installationId} outcome=${outcome}`
    );
  }

  private async run(schedule: PluginActionSchedule): Promise<string> {
    try {
      return await this.oneAtATime(() => this.runInTurn(schedule));
    } catch (error) {
      if (error instanceof ActionNotDeclaredError) {
        return this.disable(schedule, PluginScheduleDisabledReason.ACTION_NOT_DECLARED);
      }
      // No verdict on the parameters: a later run may finish within the budget.
      if (error instanceof ActionInputInvalidError && isOverBudget(error.errorDetails?.errors)) {
        return this.retry(schedule, 'VALIDATION_OVER_BUDGET');
      }
      if (error instanceof ActionInputInvalidError || error instanceof ActionInputTooLargeError) {
        return this.disable(schedule, PluginScheduleDisabledReason.INVALID_PARAMETERS);
      }
      // Start limits queue a scheduled run, so only the validation pool refuses with this.
      if (error instanceof TooManyExecutionsError) {
        return this.retry(schedule, 'VALIDATION_BUSY');
      }
      if (error instanceof InstallationInactiveError) {
        return this.park(schedule);
      }
      if (isLockConflict(error)) {
        return this.retry(schedule, 'DB_CONFLICT');
      }
      // Any other error passes too: without a retry the runner would skip to the next slot.
      if (!isScheduleNotHeld(error)) {
        this.retry(schedule, 'ERROR');
      }
      throw withoutQuery(error);
    }
  }

  /** Reads everything a verdict needs once its turn comes: a batch may wait long enough for any of it to change. */
  private async runInTurn(schedule: PluginActionSchedule): Promise<string> {
    // A wait past the stuck timeout lets another replica take the row, and a member delete or pause it.
    const held = await this.repository.exists({
      where: { id: schedule.id, status: TriggerStatus.PROCESSING, version: schedule.version },
    });
    if (!held) {
      throw scheduleNotHeldError(schedule.id);
    }
    // Checked once its turn comes: a run started on an exiting replica would only time out.
    if (this.shutdown.isInShutdownMode()) {
      return this.retry(schedule, 'SHUTDOWN');
    }
    const installation = await this.installations.findById(schedule.installationId);
    if (!installation || installation.uninstalledAt !== null) {
      return this.park(schedule);
    }
    const plugin = await this.plugins.findById(schedule.pluginId);
    if (plugin?.suspendedAt) {
      return 'PLUGIN_SUSPENDED';
    }
    if (await this.executions.hasOpenForSchedule(schedule.id)) {
      return 'PREVIOUS_RUN_OPEN';
    }

    let member: ProjectMemberDto | null;
    try {
      member = await this.owners.activeMember(schedule.projectId, installation.userId);
    } catch (error) {
      this.logger.warn(
        `Plugin schedule owner check failed scheduleId=${schedule.id} projectId=${schedule.projectId}: ${castError(error).message}`
      );
      return this.retry(schedule, 'IDP_UNAVAILABLE');
    }
    // A skip, not a disable: the schedule runs again once the owner is an active member.
    if (!member) {
      return 'OWNER_NOT_MEMBER';
    }
    const version = plugin?.currentVersionId
      ? await this.versions.findById(plugin.currentVersionId)
      : null;
    if (!version) {
      return this.disable(schedule, PluginScheduleDisabledReason.ACTION_NOT_DECLARED);
    }

    const started = await this.starter.startScheduled({
      installation,
      version,
      action: schedule.action,
      input: schedule.parameters,
      role: member.role,
      scheduleId: schedule.id,
      scheduleVersion: schedule.version,
    });
    // insertScheduled wrote it too, but the runner's save would otherwise write the old pointer back.
    schedule.lastExecutionId = started.id;
    return `${started.status} executionId=${started.id}`;
  }

  private oneAtATime<T>(start: () => Promise<T>): Promise<T> {
    const result = this.starts.then(start);
    this.starts = result.catch(() => undefined);
    return result;
  }

  private park(schedule: PluginActionSchedule): string {
    schedule.parked = true;
    return 'PARKED';
  }

  private retry(schedule: PluginActionSchedule, reason: string): string {
    // On the minute the poll reads: a moment past it, the retry would wait one more poll.
    const at = Date.now() + this.config.scheduleRetrySeconds * 1000;
    schedule.retryAt = new Date(at - (at % 60_000));
    return `RETRY reason=${reason}`;
  }

  private disable(schedule: PluginActionSchedule, reason: PluginScheduleDisabledReason): string {
    schedule.disable(reason);
    return `DISABLED reason=${reason}`;
  }
}
