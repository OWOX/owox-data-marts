import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsSelect, In, IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { isPluginOwnedErrorCode, PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import { PluginActionExecution } from '../entities/plugin-action-execution.entity';
import { PluginInstallation } from '../entities/plugin-installation.entity';
import {
  PluginActionExecutionStatus,
  type PluginActionTrigger,
} from '../enums/plugin-action-execution-status.enum';
import { InstallationInactiveError, TooManyExecutionsError } from '../errors/plugin-action.errors';

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

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** UTF-8 bytes of what the column transformer stores for `value`; null and undefined store NULL, 0 bytes. */
function byteLength(value: unknown): number {
  return value === null || value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value) ?? '');
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

export type FinishExecutionInput =
  | { status: PluginActionExecutionStatus.SUCCEEDED; result: unknown }
  | { status: PluginActionExecutionStatus.FAILED; errorCode: string; errorMessage: string }
  | { status: PluginActionExecutionStatus.TIMED_OUT; errorMessage: string };

/** Every write to plugin_action_execution. Status changes are compare-and-set from RUNNING. */
@Injectable()
export class PluginActionExecutionService {
  constructor(
    @InjectRepository(PluginActionExecution)
    private readonly executions: Repository<PluginActionExecution>,
    @InjectRepository(PluginInstallation)
    private readonly installations: Repository<PluginInstallation>
  ) {}

  @Transactional()
  async insertRunning(request: InsertRunningExecutionInput): Promise<PluginActionExecution> {
    // Must run first: it serializes starts, and an earlier read would pin a stale snapshot.
    const lock = await this.installations
      .createQueryBuilder()
      .update(PluginInstallation)
      .set({ modifiedAt: () => 'modifiedAt' })
      .where('id = :id', { id: request.installationId })
      .andWhere('uninstalledAt IS NULL')
      .execute();
    if (lock.affected !== 1) {
      throw new InstallationInactiveError();
    }

    const now = Date.now();
    // A row past its deadline belongs to a dead replica until the sweep ends it; it holds no slot.
    const running = await this.executions.countBy({
      installationId: request.installationId,
      status: PluginActionExecutionStatus.RUNNING,
      deadlineAt: MoreThan(new Date(now)),
    });
    if (running >= PLUGIN_ACTION_LIMITS.maxRunningPerInstallation) {
      throw new TooManyExecutionsError();
    }
    await this.assertWithinStartLimits(request.installationId, now);

    // Whole seconds, so MySQL datetime(0) cannot move the deadline the timer uses; the deadline rounds up, so
    // the action never gets less than its declared timeout.
    const startedAt = new Date(Math.floor(now / 1000) * 1000);
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
        status: PluginActionExecutionStatus.RUNNING,
        role: request.role,
        tokenHash: request.tokenHash,
        startedAt,
        deadlineAt: new Date(Math.ceil((now + request.timeoutSeconds * 1000) / 1000) * 1000),
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
        result: null,
        payloadBytes: request.inputBytes,
      })
    );
  }

  /**
   * Every row counts as a start whatever its status, so a start-then-cancel loop meets the limits too.
   * All three numbers come from one range scan of idx_plugin_action_execution_starts: the byte sum reads
   * 48 h of rows, twice the payload retention, so a sweep that lags a little still counts; the sweep
   * resets payloadBytes to 0 when it clears a row. SUM comes back as a string on MySQL.
   */
  async assertWithinStartLimits(installationId: string, now: number): Promise<void> {
    const raw = await this.executions
      .createQueryBuilder('e')
      .select('SUM(CASE WHEN e.startedAt > :minuteAgo THEN 1 ELSE 0 END)', 'perMinute')
      .addSelect('SUM(CASE WHEN e.startedAt > :dayAgo THEN 1 ELSE 0 END)', 'perDay')
      .addSelect('SUM(e.payloadBytes)', 'bytes')
      .where('e.installationId = :installationId', { installationId })
      .andWhere('e.startedAt > :bytesSince')
      .setParameters({
        minuteAgo: new Date(now - MINUTE_MS),
        dayAgo: new Date(now - DAY_MS),
        bytesSince: new Date(now - 2 * PLUGIN_ACTION_LIMITS.payloadRetentionHours * HOUR_MS),
      })
      .getRawOne<{
        perMinute: string | number | null;
        perDay: string | number | null;
        bytes: string | number | null;
      }>();
    const perMinute = Number(raw?.perMinute ?? 0);
    const perDay = Number(raw?.perDay ?? 0);
    const bytes = Number(raw?.bytes ?? 0);
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
      { id, installationId, status: PluginActionExecutionStatus.RUNNING },
      {
        status: PluginActionExecutionStatus.CANCELLED,
        finishedAt: new Date(),
        errorMessage: 'The execution was cancelled',
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
