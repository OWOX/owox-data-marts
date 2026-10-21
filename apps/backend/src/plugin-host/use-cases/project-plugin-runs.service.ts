import { BadRequestException, Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { isPluginOwnedErrorCode } from '../constants/plugin-action-limits';
import type { ListPluginRunsCommand, PluginRunCommand } from '../dto/domain/plugin-run.command';
import type { PluginRunPage, PluginRunView } from '../dto/domain/plugin-run.dto';
import { isFinalPluginActionStatus } from '../enums/plugin-action-execution-status.enum';
import { ExecutionNotFoundError } from '../errors/plugin-action.errors';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import {
  PluginActionExecutionService,
  type PluginRunRow,
} from '../services/plugin-action-execution.service';
import { PluginActionScheduleService } from '../services/plugin-action-schedule.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { decodePluginRunCursor, encodePluginRunCursor } from '../utils/plugin-run-cursor.util';
import { pluginNamesById, unique } from './project-plugin-names';
import { isProjectAdmin, isVisibleTo } from './project-plugin-visibility';

/** Run History: a project admin's whole project, anyone else's own runs. */
@Injectable()
export class ProjectPluginRunsService {
  constructor(
    private readonly executions: PluginActionExecutionService,
    private readonly schedules: PluginActionScheduleService,
    private readonly plugins: PluginService,
    private readonly versions: PluginVersionService,
    private readonly mapper: PluginPresentationMapper,
    private readonly idpProjections: IdpProjectionsFacade
  ) {}

  async list(command: ListPluginRunsCommand): Promise<PluginRunPage> {
    const { context } = command;
    const after = command.cursor === null ? null : decodePluginRunCursor(command.cursor);
    if (command.cursor !== null && after === null) {
      throw new BadRequestException('cursor is not a Run History cursor');
    }
    // A run's userId is its installation owner's, so a member's own id is their whole scope.
    const filter = isProjectAdmin(context)
      ? command.filter
      : { ...command.filter, userId: context.userId };
    const rows = await this.executions.listRuns(
      context.projectId,
      filter,
      after,
      command.limit + 1
    );
    const page = rows.slice(0, command.limit);
    const last = page[page.length - 1];
    return {
      items: await this.toItems(context, page),
      nextCursor:
        rows.length > command.limit
          ? encodePluginRunCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  async get(command: PluginRunCommand): Promise<PluginRunView> {
    const [item] = await this.toItems(command.context, [await this.visibleRun(command)]);
    return item;
  }

  // A run that already finished keeps its outcome and is answered as it is.
  async cancel(command: PluginRunCommand): Promise<PluginRunView> {
    const run = await this.visibleRun(command);
    await this.executions.cancel(run.id, run.installationId);
    return this.get(command);
  }

  // Someone else's run answers as a missing one, so an id tells a member nothing.
  private async visibleRun({ context, id }: PluginRunCommand): Promise<PluginRunRow> {
    const run = await this.executions.findRun(id);
    if (!run || !isVisibleTo(context, run)) {
      throw new ExecutionNotFoundError();
    }
    return run;
  }

  private async toItems(
    context: AuthorizationContext,
    rows: PluginRunRow[]
  ): Promise<PluginRunView[]> {
    const names = await pluginNamesById(
      this.plugins,
      this.versions,
      this.mapper,
      rows.map(row => row.pluginId)
    );
    const versionById = new Map(
      (await this.versions.findByIds(unique(rows.map(row => row.pluginVersionId)))).map(version => [
        version.id,
        version,
      ])
    );
    const scheduleNames = await this.schedules.findNames(
      unique(rows.flatMap(row => row.scheduleId ?? []))
    );
    const owners = await this.idpProjections.getUserProjectionList(
      unique(rows.map(row => row.userId))
    );

    return rows.map(row => {
      return {
        id: row.id,
        pluginId: row.pluginId,
        pluginName: names.get(row.pluginId) ?? row.pluginId,
        pluginVersion: versionById.get(row.pluginVersionId)?.semver ?? null,
        action: row.action,
        status: row.status,
        trigger: row.trigger,
        scheduleId: row.scheduleId,
        scheduleName: row.scheduleId === null ? null : (scheduleNames.get(row.scheduleId) ?? null),
        owner: owners.getByUserId(row.userId) ?? null,
        createdAt: row.createdAt,
        queuedAt: row.queuedAt,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        timeLimitSeconds: timeLimitSeconds(row, versionById.get(row.pluginVersionId)),
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        // The sweep clears only a plugin's own message; OWOX's messages stay with the row.
        errorMessageCleared:
          row.payloadsClearedAt !== null && isPluginOwnedErrorCode(row.errorCode),
        canCancel:
          (isProjectAdmin(context) || row.userId === context.userId) &&
          !isFinalPluginActionStatus(row.status),
      };
    });
  }
}

// The start window rounds the deadline out by up to a second, so the declared limit is exact.
function timeLimitSeconds(
  row: PluginRunRow,
  version: { backend: { actions: Record<string, { timeoutSeconds: number }> } | null } | undefined
): number | null {
  if (!row.startedAt || !row.deadlineAt) {
    return null;
  }
  const actions = version?.backend?.actions;
  return actions && Object.hasOwn(actions, row.action)
    ? actions[row.action].timeoutSeconds
    : Math.round((row.deadlineAt.getTime() - row.startedAt.getTime()) / 1000);
}
