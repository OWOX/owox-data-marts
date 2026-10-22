import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FindOptionsSelect,
  FindOptionsWhere,
  In,
  IsNull,
  LessThan,
  MoreThan,
  QueryFailedError,
  Raw,
  Repository,
} from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { toCursorTimestamp } from '../../data-marts/search/sources/indexable-source.port';
import { isPluginOwnedErrorCode, PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import type { PluginRunCursor, PluginRunFilter } from '../dto/domain/plugin-run.dto';
import { PluginActionExecution } from '../entities/plugin-action-execution.entity';
import { PluginActionSchedule } from '../entities/plugin-action-schedule.entity';
import { PluginInstallation } from '../entities/plugin-installation.entity';
import {
  PluginActionExecutionStatus,
  type PluginActionTrigger,
} from '../enums/plugin-action-execution-status.enum';
import { TooManyExecutionsError } from '../errors/plugin-action.errors';
import { lockActiveInstallation } from '../utils/installation-lock.util';

export interface InsertRunningExecutionInput {
  pluginId: string;
  pluginVersionId: string;
  installationId: string;
  projectId: string;
  userId: string;
  action: string;
  input: unknown;
  /** UTF-8 bytes of the stored input, measured once by the caller; 0 when it stores NULL. */
  inputBytes: number;
  role: string;
  timeoutSeconds: number;
  tokenHash: string;
  trigger: PluginActionTrigger;
}

export interface InsertScheduledExecutionInput extends Omit<
  InsertRunningExecutionInput,
  'trigger'
> {
  scheduleId: string;
  /** The version the runner's PROCESSING save left on the schedule. */
  scheduleVersion: number;
}

export interface PromoteQueuedExecutionInput {
  id: string;
  installationId: string;
  pluginVersionId: string;
  role: string;
  tokenHash: string;
  timeoutSeconds: number;
}

export type PromoteOutcome =
  | { outcome: 'STARTED'; execution: PluginActionExecution }
  | { outcome: 'WAIT' }
  | { outcome: 'GONE' };

type StartTotals = {
  perMinute: string | number | null;
  perDay: string | number | null;
  bytes: string | number | null;
};

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

class ScheduleNotHeldError extends QueryFailedError {}

/** The runner skips its save on this error, so it cannot undo a delete or a pause made since its claim. */
export function scheduleNotHeldError(scheduleId: string): QueryFailedError {
  return new ScheduleNotHeldError(
    '',
    undefined,
    new Error(`Plugin schedule ${scheduleId} changed since its claim (optimistic lock)`)
  );
}

export function isScheduleNotHeld(error: unknown): boolean {
  return error instanceof ScheduleNotHeldError;
}

/** UTF-8 bytes of what the column transformer stores for `value`; null and undefined store NULL, 0 bytes. */
function byteLength(value: unknown): number {
  return value === null || value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value) ?? '');
}

// Whole seconds, so MySQL datetime(0) cannot move the deadline the timer uses; the deadline rounds up, so
// the action never gets less than its declared timeout.
function startWindow(now: number, timeoutSeconds: number): { startedAt: Date; deadlineAt: Date } {
  return {
    startedAt: new Date(Math.floor(now / 1000) * 1000),
    deadlineAt: new Date(Math.ceil((now + timeoutSeconds * 1000) / 1000) * 1000),
  };
}

/** What an execution token stands for; the guard reads it on every Worker request. */
const TOKEN_OWNER_COLUMNS = {
  id: true,
  pluginId: true,
  installationId: true,
  projectId: true,
  userId: true,
  role: true,
} as const satisfies FindOptionsSelect<PluginActionExecution>;
export type ExecutionTokenOwner = Pick<PluginActionExecution, keyof typeof TOKEN_OWNER_COLUMNS>;

/** What a view of an execution reads; `input` is left out, only the Worker's context returns it. */
const SUMMARY_COLUMNS = {
  id: true,
  installationId: true,
  action: true,
  status: true,
  trigger: true,
  scheduleId: true,
  startedAt: true,
  deadlineAt: true,
  finishedAt: true,
  errorCode: true,
  errorMessage: true,
  result: true,
} as const satisfies FindOptionsSelect<PluginActionExecution>;
export type PluginActionExecutionSummary = Pick<
  PluginActionExecution,
  keyof typeof SUMMARY_COLUMNS
>;

/** What a schedule's last run shows; results can be 1 MiB each. */
const LAST_RUN_COLUMNS = {
  id: true,
  status: true,
  errorCode: true,
  finishedAt: true,
} as const satisfies FindOptionsSelect<PluginActionExecution>;
export type PluginActionLastRun = Pick<PluginActionExecution, keyof typeof LAST_RUN_COLUMNS>;

/** What Run History shows; input, result and the token hash are never read for it. */
const RUN_COLUMNS = {
  id: true,
  pluginId: true,
  pluginVersionId: true,
  installationId: true,
  projectId: true,
  userId: true,
  action: true,
  trigger: true,
  scheduleId: true,
  status: true,
  createdAt: true,
  queuedAt: true,
  startedAt: true,
  deadlineAt: true,
  finishedAt: true,
  errorCode: true,
  errorMessage: true,
  payloadsClearedAt: true,
} as const satisfies FindOptionsSelect<PluginActionExecution>;
export type PluginRunRow = Pick<PluginActionExecution, keyof typeof RUN_COLUMNS>;

export type FinishExecutionInput =
  | { status: PluginActionExecutionStatus.SUCCEEDED; result: unknown }
  | { status: PluginActionExecutionStatus.FAILED; errorCode: string; errorMessage: string }
  | { status: PluginActionExecutionStatus.TIMED_OUT; errorMessage: string };

/** Every write to plugin_action_execution. Status changes are compare-and-set. */
@Injectable()
export class PluginActionExecutionService {
  constructor(
    @InjectRepository(PluginActionExecution)
    private readonly executions: Repository<PluginActionExecution>,
    @InjectRepository(PluginInstallation)
    private readonly installations: Repository<PluginInstallation>,
    @InjectRepository(PluginActionSchedule)
    private readonly schedules: Repository<PluginActionSchedule>
  ) {}

  @Transactional()
  async insertRunning(request: InsertRunningExecutionInput): Promise<PluginActionExecution> {
    await lockActiveInstallation(this.installations, request.installationId);
    const now = Date.now();
    const refusal = await this.startRefusal(request.installationId, now);
    if (refusal) {
      throw refusal;
    }
    return this.insert({ ...request, scheduleId: null }, now, false);
  }

  /** A start limit queues the run rather than refusing it; the schedule names the row. */
  @Transactional()
  async insertScheduled(
    request: InsertScheduledExecutionInput
  ): Promise<{ execution: PluginActionExecution; queued: boolean }> {
    await lockActiveInstallation(this.installations, request.installationId);
    const now = Date.now();
    const queued = (await this.startRefusal(request.installationId, now)) !== null;
    const execution = await this.insert({ ...request, trigger: 'schedule' }, now, queued);
    // `update` raises the version column by itself unless the values name it.
    const { affected } = await this.schedules.update(
      {
        id: request.scheduleId,
        status: TriggerStatus.PROCESSING,
        version: request.scheduleVersion,
      },
      { lastExecutionId: execution.id, version: () => 'version' }
    );
    if (affected !== 1) {
      throw scheduleNotHeldError(request.scheduleId);
    }
    return { execution, queued };
  }

  /** WAIT while a limit refuses; GONE when the row already left QUEUED. */
  @Transactional()
  async promote(request: PromoteQueuedExecutionInput): Promise<PromoteOutcome> {
    await lockActiveInstallation(this.installations, request.installationId);
    const now = Date.now();
    if (await this.startRefusal(request.installationId, now)) {
      return { outcome: 'WAIT' };
    }
    const { affected } = await this.executions.update(
      {
        id: request.id,
        installationId: request.installationId,
        status: PluginActionExecutionStatus.QUEUED,
      },
      {
        status: PluginActionExecutionStatus.RUNNING,
        tokenHash: request.tokenHash,
        role: request.role,
        pluginVersionId: request.pluginVersionId,
        ...startWindow(now, request.timeoutSeconds),
      }
    );
    if (affected !== 1) {
      return { outcome: 'GONE' };
    }
    return {
      outcome: 'STARTED',
      execution: await this.executions.findOneByOrFail({ id: request.id }),
    };
  }

  /** promote's limit check without the lock, so a refused promotion spends no IDP call or validation. */
  async refusesStart(installationId: string): Promise<boolean> {
    return (await this.startRefusal(installationId, Date.now())) !== null;
  }

  /**
   * Counts every started row whatever its status, by startedAt, and by queuedAt a queued row cancelled, failed
   * or timed out before it started, so a start-then-cancel loop meets the limits; a live QUEUED row does not count.
   * One range scan each of idx_plugin_action_execution_starts and _queue; byte sums read 48 h, twice the
   * payload retention, and the sweep resets payloadBytes to 0 when it clears a row. SUM is a string on MySQL.
   */
  async assertWithinStartLimits(installationId: string, now: number): Promise<void> {
    const since = {
      minuteAgo: new Date(now - MINUTE_MS),
      dayAgo: new Date(now - DAY_MS),
      bytesSince: new Date(now - 2 * PLUGIN_ACTION_LIMITS.payloadRetentionHours * HOUR_MS),
    };
    const started = await this.executions
      .createQueryBuilder('e')
      .select('SUM(CASE WHEN e.startedAt > :minuteAgo THEN 1 ELSE 0 END)', 'perMinute')
      .addSelect('SUM(CASE WHEN e.startedAt > :dayAgo THEN 1 ELSE 0 END)', 'perDay')
      .addSelect('SUM(e.payloadBytes)', 'bytes')
      .where('e.installationId = :installationId', { installationId })
      .andWhere('e.startedAt > :bytesSince')
      .setParameters(since)
      .getRawOne<StartTotals>();
    const unstarted = await this.executions
      .createQueryBuilder('e')
      .select('SUM(CASE WHEN e.queuedAt > :minuteAgo THEN 1 ELSE 0 END)', 'perMinute')
      .addSelect('SUM(CASE WHEN e.queuedAt > :dayAgo THEN 1 ELSE 0 END)', 'perDay')
      .addSelect('SUM(e.payloadBytes)', 'bytes')
      .where('e.installationId = :installationId', { installationId })
      .andWhere('e.status IN (:...statuses)', {
        statuses: [
          PluginActionExecutionStatus.CANCELLED,
          PluginActionExecutionStatus.FAILED,
          PluginActionExecutionStatus.TIMED_OUT,
        ],
      })
      .andWhere('e.queuedAt > :bytesSince')
      .andWhere('e.startedAt IS NULL')
      .setParameters(since)
      .getRawOne<StartTotals>();
    const total = (key: keyof StartTotals) =>
      Number(started?.[key] ?? 0) + Number(unstarted?.[key] ?? 0);
    const perMinute = total('perMinute');
    const perDay = total('perDay');
    const bytes = total('bytes');
    if (perMinute >= PLUGIN_ACTION_LIMITS.maxStartsPerInstallationPerMinute) {
      throw new TooManyExecutionsError(
        `${PLUGIN_ACTION_LIMITS.maxStartsPerInstallationPerMinute} starts per minute reached`
      );
    }
    if (perDay >= PLUGIN_ACTION_LIMITS.maxStartsPerInstallationPerDay) {
      throw new TooManyExecutionsError(
        `${PLUGIN_ACTION_LIMITS.maxStartsPerInstallationPerDay} starts per day reached`
      );
    }
    if (bytes >= PLUGIN_ACTION_LIMITS.maxPayloadBytesPerInstallation) {
      throw new TooManyExecutionsError(
        `${PLUGIN_ACTION_LIMITS.maxPayloadBytesPerInstallation / (1024 * 1024)} MiB of stored payloads reached`
      );
    }
  }

  findById(id: string): Promise<PluginActionExecutionSummary | null> {
    return this.executions.findOne({ select: SUMMARY_COLUMNS, where: { id } });
  }

  findWithInput(id: string): Promise<PluginActionExecution | null> {
    return this.executions.findOneBy({ id });
  }

  findLastRuns(ids: readonly string[]): Promise<PluginActionLastRun[]> {
    return this.executions.find({ select: LAST_RUN_COLUMNS, where: { id: In(ids) } });
  }

  /** One page of a project's runs, newest first, ties by id descending, after the cursor's row. */
  listRuns(
    projectId: string,
    filter: PluginRunFilter,
    after: PluginRunCursor | null,
    take: number
  ): Promise<PluginRunRow[]> {
    const where: FindOptionsWhere<PluginActionExecution> = {
      projectId,
      ...(filter.statuses.length > 0 && { status: In([...filter.statuses]) }),
      ...(filter.trigger !== null && { trigger: filter.trigger }),
      ...(filter.pluginId !== null && { pluginId: filter.pluginId }),
      ...(filter.scheduleId !== null && { scheduleId: filter.scheduleId }),
      ...(filter.userId !== null && { userId: filter.userId }),
    };
    const at = after && this.storedCreatedAt(after.createdAt);
    return this.executions.find({
      select: RUN_COLUMNS,
      where: after
        ? [
            { ...where, createdAt: Raw(column => `${column} < :before`, { before: at }) },
            {
              ...where,
              createdAt: Raw(column => `${column} = :tie`, { tie: at }),
              id: LessThan(after.id),
            },
          ]
        : where,
      order: { createdAt: 'DESC', id: 'DESC' },
      take,
    });
  }

  findRun(id: string): Promise<PluginRunRow | null> {
    return this.executions.findOne({ select: RUN_COLUMNS, where: { id } });
  }

  hasOpenForSchedule(scheduleId: string): Promise<boolean> {
    return this.executions.existsBy({
      scheduleId,
      status: In([PluginActionExecutionStatus.QUEUED, PluginActionExecutionStatus.RUNNING]),
    });
  }

  findOldestQueued(installationId: string): Promise<PluginActionExecution | null> {
    return this.executions.findOne({
      where: { installationId, status: PluginActionExecutionStatus.QUEUED },
      order: { queuedAt: 'ASC', id: 'ASC' },
    });
  }

  /** One page of the installations with a QUEUED row, in id order, after the previous page's last id. */
  async findInstallationsWithQueued(limit: number, after?: string): Promise<string[]> {
    const query = this.executions
      .createQueryBuilder('e')
      .select('e.installationId', 'installationId')
      .distinct(true)
      .where('e.status = :status', { status: PluginActionExecutionStatus.QUEUED })
      .orderBy('e.installationId', 'ASC')
      .limit(limit);
    if (after !== undefined) {
      query.andWhere('e.installationId > :after', { after });
    }
    const rows = await query.getRawMany<{ installationId: string }>();
    return rows.map(row => row.installationId);
  }

  async findStatus(id: string): Promise<PluginActionExecutionStatus | null> {
    const row = await this.executions.findOne({
      select: { id: true, status: true },
      where: { id },
    });
    return row?.status ?? null;
  }

  findRunningByTokenHash(tokenHash: string, now: Date): Promise<ExecutionTokenOwner | null> {
    return this.executions.findOne({
      select: TOKEN_OWNER_COLUMNS,
      where: { tokenHash, status: PluginActionExecutionStatus.RUNNING, deadlineAt: MoreThan(now) },
    });
  }

  async finish(id: string, outcome: FinishExecutionInput): Promise<boolean> {
    const { affected } = await this.executions.update(
      { id, status: PluginActionExecutionStatus.RUNNING },
      {
        status: outcome.status,
        finishedAt: new Date(),
        errorCode: outcome.status === PluginActionExecutionStatus.FAILED ? outcome.errorCode : null,
        errorMessage: 'errorMessage' in outcome ? outcome.errorMessage : null,
        // TypeORM's update typing turns an `unknown` column into `{}`, which refuses any value.
        result: (outcome.status === PluginActionExecutionStatus.SUCCEEDED
          ? outcome.result
          : null) as never,
        ...(outcome.status === PluginActionExecutionStatus.SUCCEEDED && {
          payloadBytes: () => `payloadBytes + ${byteLength(outcome.result)}`,
        }),
      }
    );
    return affected === 1;
  }

  async cancel(id: string, installationId: string): Promise<boolean> {
    const { affected } = await this.executions.update(
      {
        id,
        installationId,
        status: In([PluginActionExecutionStatus.RUNNING, PluginActionExecutionStatus.QUEUED]),
      },
      {
        status: PluginActionExecutionStatus.CANCELLED,
        finishedAt: new Date(),
        errorMessage: 'The execution was cancelled',
      }
    );
    return affected === 1;
  }

  async cancelQueuedForSchedule(scheduleId: string): Promise<number> {
    const { affected } = await this.executions.update(
      { scheduleId, status: PluginActionExecutionStatus.QUEUED },
      {
        status: PluginActionExecutionStatus.CANCELLED,
        finishedAt: new Date(),
        errorMessage: 'The schedule was changed, paused or deleted',
      }
    );
    return affected ?? 0;
  }

  async cancelQueuedForInstallation(installationId: string): Promise<number> {
    const { affected } = await this.executions.update(
      { installationId, status: PluginActionExecutionStatus.QUEUED },
      {
        status: PluginActionExecutionStatus.CANCELLED,
        finishedAt: new Date(),
        errorMessage: 'The plugin was uninstalled',
      }
    );
    return affected ?? 0;
  }

  async failQueued(id: string, errorCode: string, errorMessage: string): Promise<boolean> {
    const { affected } = await this.executions.update(
      { id, status: PluginActionExecutionStatus.QUEUED },
      {
        status: PluginActionExecutionStatus.FAILED,
        finishedAt: new Date(),
        errorCode,
        errorMessage,
      }
    );
    return affected === 1;
  }

  /** RUNNING rows whose dispatching replica died before the deadline it would have enforced. */
  async timeOutOrphans(deadlineBefore: Date): Promise<number> {
    const { affected } = await this.executions.update(
      { status: PluginActionExecutionStatus.RUNNING, deadlineAt: LessThan(deadlineBefore) },
      {
        status: PluginActionExecutionStatus.TIMED_OUT,
        finishedAt: new Date(),
        errorMessage: 'The execution outlived its replica',
      }
    );
    return affected ?? 0;
  }

  /** QUEUED rows that a start limit held past the queue's maximum age. */
  async timeOutQueued(queuedBefore: Date): Promise<number> {
    const { affected } = await this.executions.update(
      { status: PluginActionExecutionStatus.QUEUED, queuedAt: LessThan(queuedBefore) },
      {
        status: PluginActionExecutionStatus.TIMED_OUT,
        finishedAt: new Date(),
        errorMessage: `The run waited ${PLUGIN_ACTION_LIMITS.queuedMaxAgeHours} hours in the queue`,
      }
    );
    return affected ?? 0;
  }

  /** Clears `input`, `result` and a plugin-authored `errorMessage` once per row, in batches. */
  clearPayloads(finishedBefore: Date, signal?: AbortSignal): Promise<number> {
    return inBatches(signal, async () => {
      const rows = await this.executions.find({
        select: { id: true, errorCode: true },
        where: { payloadsClearedAt: IsNull(), finishedAt: LessThan(finishedBefore) },
        take: PLUGIN_ACTION_LIMITS.sweepBatchSize,
      });
      if (rows.length === 0) return 0;
      // Plugin text may echo the input; OWOX's own messages stay with the row.
      const pluginAuthored = rows.filter(row => isPluginOwnedErrorCode(row.errorCode));
      if (pluginAuthored.length > 0) {
        await this.executions.update(
          { id: In(pluginAuthored.map(row => row.id)) },
          { errorMessage: null }
        );
      }
      // Marked last, so a batch that fails half way is picked up again by the next run.
      await this.executions.update(
        { id: In(rows.map(row => row.id)) },
        {
          input: () => 'NULL',
          result: () => 'NULL',
          payloadsClearedAt: new Date(),
          payloadBytes: 0,
        }
      );
      return rows.length;
    });
  }

  deleteFinished(finishedBefore: Date, signal?: AbortSignal): Promise<number> {
    return inBatches(signal, async () => {
      const rows = await this.executions.find({
        select: { id: true },
        where: { finishedAt: LessThan(finishedBefore) },
        take: PLUGIN_ACTION_LIMITS.sweepBatchSize,
      });
      if (rows.length > 0) {
        await this.executions.delete({ id: In(rows.map(row => row.id)) });
      }
      return rows.length;
    });
  }

  // SQLite stores the column default as whole-second text, and a bound Date sorts after it.
  private storedCreatedAt(createdAt: Date): Date | string {
    return this.executions.manager.connection.options.type === 'better-sqlite3'
      ? toCursorTimestamp(createdAt)
      : createdAt;
  }

  /** The refusal a start would meet now, or null; only an answer under the installation lock decides. */
  private async startRefusal(
    installationId: string,
    now: number
  ): Promise<TooManyExecutionsError | null> {
    // A row past its deadline belongs to a dead replica until the sweep ends it; it holds no slot.
    const running = await this.executions.countBy({
      installationId,
      status: PluginActionExecutionStatus.RUNNING,
      deadlineAt: MoreThan(new Date(now)),
    });
    if (running >= PLUGIN_ACTION_LIMITS.maxRunningPerInstallation) {
      return new TooManyExecutionsError();
    }
    try {
      await this.assertWithinStartLimits(installationId, now);
      return null;
    } catch (error) {
      if (error instanceof TooManyExecutionsError) return error;
      throw error;
    }
  }

  private insert(
    request: InsertRunningExecutionInput & { scheduleId: string | null },
    now: number,
    queued: boolean
  ): Promise<PluginActionExecution> {
    return this.executions.save(
      this.executions.create({
        pluginId: request.pluginId,
        pluginVersionId: request.pluginVersionId,
        installationId: request.installationId,
        projectId: request.projectId,
        userId: request.userId,
        action: request.action,
        input: request.input,
        trigger: request.trigger,
        scheduleId: request.scheduleId,
        role: request.role,
        ...(queued
          ? {
              status: PluginActionExecutionStatus.QUEUED,
              tokenHash: null,
              startedAt: null,
              deadlineAt: null,
              queuedAt: new Date(now),
            }
          : {
              status: PluginActionExecutionStatus.RUNNING,
              tokenHash: request.tokenHash,
              ...startWindow(now, request.timeoutSeconds),
              queuedAt: null,
            }),
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
        result: null,
        payloadBytes: request.inputBytes,
      })
    );
  }
}

/** Repeats `batch` until a short batch or an abort; batches select ids first, `UPDATE … LIMIT` is not portable. */
async function inBatches(
  signal: AbortSignal | undefined,
  batch: () => Promise<number>
): Promise<number> {
  let total = 0;
  while (!signal?.aborted) {
    const handled = await batch();
    total += handled;
    if (handled < PLUGIN_ACTION_LIMITS.sweepBatchSize) break;
  }
  return total;
}
