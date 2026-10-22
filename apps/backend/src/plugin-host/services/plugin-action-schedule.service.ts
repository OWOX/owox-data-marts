import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { castError } from '@owox/internal-helpers';
import { CronTime } from 'cron';
import { In, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Transactional } from 'typeorm-transactional';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import type {
  PluginScheduleDraft,
  PluginScheduleOwner,
  PluginSchedulePatch,
  PluginScheduleView,
} from '../dto/domain/plugin-action-schedule.dto';
import { PluginActionSchedule } from '../entities/plugin-action-schedule.entity';
import { PluginInstallation } from '../entities/plugin-installation.entity';
import { PluginScheduleDisabledReason } from '../enums/plugin-action-schedule.enum';
import {
  ActionNotDeclaredError,
  InstallationInactiveError,
  TooManyExecutionsError,
} from '../errors/plugin-action.errors';
import {
  InvalidScheduleError,
  ScheduleBusyError,
  ScheduleNotFoundError,
  ScheduleParametersInvalidError,
  ScheduleParametersTooLargeError,
  SchedulePausedByAdminError,
  TooManySchedulesError,
} from '../errors/plugin-schedule.errors';
import { toPluginScheduleView } from '../mappers/plugin-action-schedule.mapper';
import { lockActiveInstallation } from '../utils/installation-lock.util';
import { findJsonShapeProblem } from '../utils/json-shape.util';
import { ActionInputValidatorService, isOverBudget } from './action-input-validator.service';
import { PluginActionExecutionService } from './plugin-action-execution.service';
import { PluginVersionService } from './plugin-version.service';
import { PluginService } from './plugin.service';

const {
  maxScheduleNameChars,
  maxScheduleCronChars,
  maxScheduleTimeZoneChars,
  scheduleBusyRetryMs,
  scheduleBusyTimeoutMs,
} = PLUGIN_ACTION_LIMITS;

/** Every read and write of plugin_action_schedule except a run's: the runner's save, the hold check, insertScheduled. */
@Injectable()
export class PluginActionScheduleService {
  private readonly logger = new Logger(PluginActionScheduleService.name);

  constructor(
    @InjectRepository(PluginActionSchedule)
    private readonly schedules: Repository<PluginActionSchedule>,
    @InjectRepository(PluginInstallation)
    private readonly installations: Repository<PluginInstallation>,
    private readonly plugins: PluginService,
    private readonly versions: PluginVersionService,
    private readonly validator: ActionInputValidatorService,
    private readonly executions: PluginActionExecutionService,
    private readonly config: PluginHostConfigService
  ) {}

  async create(
    owner: PluginScheduleOwner,
    draft: PluginScheduleDraft,
    enabled: boolean
  ): Promise<PluginScheduleView> {
    // Before the transaction: validation waits for a worker, and the lock must be the transaction's first statement.
    const nextRun = await this.validate(owner.pluginId, draft);
    const schedule = await this.insert(
      this.schedules.create({
        pluginId: owner.pluginId,
        installationId: owner.installationId,
        projectId: owner.projectId,
        action: draft.action,
        parameters: draft.parameters ?? null,
        cronExpression: draft.cron,
        timeZone: draft.timeZone,
        name: draft.name,
        isActive: enabled,
        status: TriggerStatus.IDLE,
        nextRunTimestamp: enabled ? nextRun : null,
        lastRunTimestamp: null,
        disabledReason: null,
        lastExecutionId: null,
      })
    );
    return toPluginScheduleView(schedule, null);
  }

  async list(installationId: string): Promise<PluginScheduleView[]> {
    return this.views(
      await this.schedules.find({
        where: { installationId },
        order: { createdAt: 'ASC', id: 'ASC' },
      })
    );
  }

  async listForInstallations(
    installationIds: readonly string[],
    limit: number,
    offset: number
  ): Promise<{ views: PluginScheduleView[]; total: number }> {
    if (installationIds.length === 0) {
      return { views: [], total: 0 };
    }
    // The project list never shows parameters, up to 64 KiB each: its views carry them undefined.
    const select = Object.fromEntries(
      this.schedules.metadata.columns
        .filter(column => column.propertyName !== 'parameters')
        .map(column => [column.propertyName, true])
    );
    const [schedules, total] = await this.schedules.findAndCount({
      select,
      where: { installationId: In([...installationIds]) },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: limit,
      skip: offset,
    });
    return { views: await this.views(schedules), total };
  }

  async get(installationId: string, id: string): Promise<PluginScheduleView> {
    const schedule = await this.schedules.findOneBy({ id, installationId });
    if (!schedule) {
      throw new ScheduleNotFoundError();
    }
    return this.view(schedule);
  }

  async findInstallationId(id: string): Promise<string | null> {
    const schedule = await this.schedules.findOne({
      select: { id: true, installationId: true },
      where: { id },
    });
    return schedule?.installationId ?? null;
  }

  /** Each schedule's name, or its action when it has none; an id without a row has no entry. */
  async findNames(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.schedules.find({
      select: { id: true, name: true, action: true },
      where: { id: In([...ids]) },
    });
    return new Map(rows.map(row => [row.id, row.name ?? row.action]));
  }

  async update(
    installationId: string,
    id: string,
    patch: PluginSchedulePatch
  ): Promise<PluginScheduleView> {
    const schedule = await this.writeWhenIdle(installationId, id, async current => {
      const draft = { ...draftOf(current), ...patch };
      const nextRun = await this.validate(current.pluginId, draft);
      const runChanged =
        draft.action !== current.action ||
        JSON.stringify(draft.parameters ?? null) !== JSON.stringify(current.parameters ?? null);
      // Same cron and zone: keep a due slot or a pending retry instead of skipping it.
      const slot =
        draft.cron === current.cronExpression && draft.timeZone === current.timeZone
          ? current.nextRunTimestamp
          : nextRun;
      const write = () =>
        this.setIfUnchanged(current, {
          action: draft.action,
          // TypeORM's update typing turns an `unknown` column into `{}`, which refuses any value.
          parameters: (draft.parameters ?? null) as never,
          cronExpression: draft.cron,
          timeZone: draft.timeZone,
          name: draft.name,
          // Paused, Disabled and parked schedules keep a null slot, and a Disabled one its reason.
          nextRunTimestamp: current.isActive && current.nextRunTimestamp !== null ? slot : null,
        });
      // A queued run would start the old action or parameters.
      return runChanged ? this.writeThenCancel(current, write) : write();
    });
    return this.view(schedule);
  }

  /** An admin's pause replaces any reason with PAUSED_BY_ADMIN, which the plugin cannot resume. */
  async pause(
    installationId: string,
    id: string,
    { byAdmin = false } = {}
  ): Promise<PluginScheduleView> {
    const schedule = await this.writeWhenIdle(installationId, id, current =>
      this.writeThenCancel(current, async () => {
        if (byAdmin) {
          return this.setIfUnchanged(current, {
            isActive: false,
            nextRunTimestamp: null,
            disabledReason: PluginScheduleDisabledReason.PAUSED_BY_ADMIN,
          });
        }
        return current.isActive
          ? this.setIfUnchanged(current, { isActive: false, nextRunTimestamp: null })
          : true;
      })
    );
    return this.view(schedule);
  }

  async resume(
    installationId: string,
    id: string,
    { byPlugin = false } = {}
  ): Promise<PluginScheduleView> {
    const schedule = await this.writeWhenIdle(installationId, id, async current => {
      if (current.isActive) {
        return true;
      }
      if (byPlugin && current.disabledReason === PluginScheduleDisabledReason.PAUSED_BY_ADMIN) {
        throw new SchedulePausedByAdminError();
      }
      const nextRun = await this.validate(current.pluginId, draftOf(current));
      const installation = await this.installations.findOneBy({ id: installationId });
      return this.setIfUnchanged(current, {
        isActive: true,
        disabledReason: null,
        // An uninstalled installation's schedule stays parked; after a restore the minute sweep gives the slot.
        nextRunTimestamp: installation?.uninstalledAt === null ? nextRun : null,
      });
    });
    return this.view(schedule);
  }

  async delete(installationId: string, id: string): Promise<void> {
    await this.writeWhenIdle(installationId, id, current =>
      this.writeThenCancel(current, async () => {
        const { affected } = await this.schedules.delete({
          id,
          installationId,
          status: TriggerStatus.IDLE,
          version: current.version,
        });
        return affected === 1;
      })
    );
  }

  /** Behind writeThenCancel's lock: an update committed first has cancelled the run, so nothing is failed or disabled. */
  @Transactional()
  async failQueuedAndDisable(
    queued: { id: string; installationId: string; scheduleId: string },
    errorCode: string,
    errorMessage: string,
    reason: PluginScheduleDisabledReason
  ): Promise<boolean> {
    await this.lockInstallation(queued.installationId);
    // Not for a row cancelled meanwhile: an update that cancels it may have changed the run.
    if (!(await this.executions.failQueued(queued.id, errorCode, errorMessage))) {
      return false;
    }
    return this.disableIfIdle(queued.scheduleId, reason);
  }

  /** Disables an Active schedule the runner does not hold; one it holds reaches the same verdict on its next run. */
  async disableIfIdle(id: string, reason: PluginScheduleDisabledReason): Promise<boolean> {
    const { affected } = await this.schedules.update(
      { id, status: TriggerStatus.IDLE, isActive: true },
      {
        isActive: false,
        nextRunTimestamp: null,
        disabledReason: reason,
        version: () => 'version + 1',
      }
    );
    return affected === 1;
  }

  // IDLE rows only: the handler parks one it holds, from its installation read or insertScheduled's lock.
  async parkForInstallation(installationId: string): Promise<void> {
    await this.schedules.update(
      { installationId, status: TriggerStatus.IDLE },
      { nextRunTimestamp: null, version: () => 'version + 1' }
    );
  }

  /** Active schedules of active installations without a slot get their next one; the minute sweep calls it. */
  async unparkStranded(now: Date, limit: number): Promise<number> {
    const stranded = await this.schedules
      .createQueryBuilder('s')
      .innerJoin(PluginInstallation, 'i', 'i.id = s.installationId AND i.uninstalledAt IS NULL')
      .where('s.isActive = :active', { active: true })
      .andWhere('s.nextRunTimestamp IS NULL')
      .andWhere('s.status = :idle', { idle: TriggerStatus.IDLE })
      .orderBy('s.id')
      .limit(limit)
      .getMany();
    let unparked = 0;
    for (const schedule of stranded) {
      let slot: Date;
      try {
        slot = schedule.nextSlotAfter(now);
      } catch (error) {
        this.logger.warn(
          `Plugin schedule ${schedule.id} has no next slot: ${castError(error).message}`
        );
        continue;
      }
      const { affected } = await this.schedules.update(
        { id: schedule.id, status: TriggerStatus.IDLE, version: schedule.version },
        { nextRunTimestamp: slot, version: () => 'version + 1' }
      );
      unparked += affected ?? 0;
    }
    return unparked;
  }

  @Transactional()
  private async insert(schedule: PluginActionSchedule): Promise<PluginActionSchedule> {
    // First: it serializes creates, and an earlier read would pin a stale count.
    await lockActiveInstallation(this.installations, schedule.installationId);
    const count = await this.schedules.countBy({ installationId: schedule.installationId });
    const max = this.config.maxSchedulesPerInstallation;
    if (count >= max) {
      throw new TooManySchedulesError(max);
    }
    return this.schedules.save(schedule);
  }

  /** The cancel commits with the write, behind the lock promote takes first, so no promotion starts the replaced run. */
  @Transactional()
  private async writeThenCancel(
    current: PluginActionSchedule,
    write: () => Promise<boolean>
  ): Promise<boolean> {
    await this.lockInstallation(current.installationId);
    if (!(await write())) {
      return false;
    }
    await this.executions.cancelQueuedForSchedule(current.id);
    return true;
  }

  // An uninstalled installation's schedules stay writable, and promote's own lock refuses it any start.
  private async lockInstallation(installationId: string): Promise<void> {
    try {
      await lockActiveInstallation(this.installations, installationId);
    } catch (error) {
      if (!(error instanceof InstallationInactiveError)) {
        throw error;
      }
    }
  }

  private async writeWhenIdle(
    installationId: string,
    id: string,
    write: (current: PluginActionSchedule) => Promise<boolean>
  ): Promise<PluginActionSchedule> {
    const giveUpAt = Date.now() + scheduleBusyTimeoutMs;
    for (;;) {
      const current = await this.schedules.findOneBy({ id, installationId });
      if (!current) {
        throw new ScheduleNotFoundError();
      }
      // Not IDLE: the runner saves the whole row it holds, so a write made meanwhile would be lost.
      if (current.status === TriggerStatus.IDLE && (await write(current))) {
        return current;
      }
      if (Date.now() >= giveUpAt) {
        throw new ScheduleBusyError();
      }
      await new Promise(resolve => setTimeout(resolve, scheduleBusyRetryMs));
    }
  }

  private async setIfUnchanged(
    current: PluginActionSchedule,
    values: QueryDeepPartialEntity<PluginActionSchedule>
  ): Promise<boolean> {
    const modifiedAt = new Date();
    const { affected } = await this.schedules.update(
      {
        id: current.id,
        installationId: current.installationId,
        status: TriggerStatus.IDLE,
        version: current.version,
      },
      { ...values, modifiedAt, version: () => 'version + 1' }
    );
    if (affected !== 1) {
      return false;
    }
    Object.assign(current, values, { modifiedAt });
    return true;
  }

  private async validate(pluginId: string, draft: PluginScheduleDraft): Promise<Date> {
    const nextRun = firstSlot(draft, new Date());
    const plugin = await this.plugins.findById(pluginId);
    const version = plugin?.currentVersionId
      ? await this.versions.findById(plugin.currentVersionId)
      : null;
    // An own property only: `constructor` must not resolve through Object.prototype.
    if (!version?.backend || !Object.hasOwn(version.backend.actions, draft.action)) {
      throw new ActionNotDeclaredError(draft.action);
    }
    const parameters = draft.parameters ?? null;
    // First, so that measuring and validating never see deeper nesting.
    const shapeProblem = findJsonShapeProblem(parameters);
    if (shapeProblem) {
      throw new ScheduleParametersInvalidError([{ instancePath: '', message: shapeProblem }]);
    }
    const maxBytes = this.config.maxScheduleParametersBytes;
    if (Buffer.byteLength(JSON.stringify(parameters)) > maxBytes) {
      throw new ScheduleParametersTooLargeError(maxBytes);
    }
    const { input } = version.backend.actions[draft.action];
    if (input) {
      const errors = await this.validator.validate(version.id, draft.action, input, parameters);
      // No verdict on the parameters: answered as a busy pool is, so the caller tries again.
      if (isOverBudget(errors)) {
        throw new TooManyExecutionsError(
          'Input validation exceeded its budget. Try again shortly.'
        );
      }
      if (errors.length > 0) {
        throw new ScheduleParametersInvalidError(errors);
      }
    }
    return nextRun;
  }

  private async view(schedule: PluginActionSchedule): Promise<PluginScheduleView> {
    const [view] = await this.views([schedule]);
    return view;
  }

  private async views(schedules: PluginActionSchedule[]): Promise<PluginScheduleView[]> {
    const ids = schedules.flatMap(schedule => schedule.lastExecutionId ?? []);
    const runs = new Map(
      (ids.length > 0 ? await this.executions.findLastRuns(ids) : []).map(run => [run.id, run])
    );
    // The 90-day sweep may have deleted the last execution: that reads as no last run.
    return schedules.map(schedule =>
      toPluginScheduleView(
        schedule,
        (schedule.lastExecutionId && runs.get(schedule.lastExecutionId)) || null
      )
    );
  }
}

function draftOf(schedule: PluginActionSchedule): PluginScheduleDraft {
  return {
    action: schedule.action,
    parameters: schedule.parameters,
    cron: schedule.cronExpression,
    timeZone: schedule.timeZone,
    name: schedule.name,
  };
}

function firstSlot(draft: PluginScheduleDraft, now: Date): Date {
  if ((draft.name?.length ?? 0) > maxScheduleNameChars) {
    throw new InvalidScheduleError(`name is longer than ${maxScheduleNameChars} characters`);
  }
  if (draft.cron.length > maxScheduleCronChars) {
    throw new InvalidScheduleError(`cron is longer than ${maxScheduleCronChars} characters`);
  }
  // CronTime reads an empty zone as the server's own.
  if (draft.timeZone.length === 0 || draft.timeZone.length > maxScheduleTimeZoneChars) {
    throw new InvalidScheduleError(
      `timeZone must have 1 to ${maxScheduleTimeZoneChars} characters`
    );
  }
  try {
    // CronTime also takes luxon's `local`, `system` and `default`, the server's own zone; Intl refuses them.
    new Intl.DateTimeFormat('en-US', { timeZone: draft.timeZone });
    return new CronTime(draft.cron, draft.timeZone).getNextDateFrom(now, draft.timeZone).toJSDate();
  } catch {
    throw new InvalidScheduleError(
      'cron must be a cron expression with a run in the next 8 years, and timeZone an IANA time zone'
    );
  }
}
