import type { PluginScheduleView } from '../dto/domain/plugin-action-schedule.dto';
import type { ProjectPluginScheduleView } from '../dto/domain/project-plugin-schedule.dto';
import type {
  MemberPluginScheduleApiDto,
  PluginScheduleApiDto,
} from '../dto/presentation/plugin-schedule-api.dto';
import type { ProjectPluginScheduleApiDto } from '../dto/presentation/project-plugin-schedule-api.dto';
import type { PluginActionSchedule } from '../entities/plugin-action-schedule.entity';
import type { PluginActionLastRun } from '../services/plugin-action-execution.service';

export function toPluginScheduleView(
  schedule: PluginActionSchedule,
  lastRun: PluginActionLastRun | null
): PluginScheduleView {
  return {
    id: schedule.id,
    pluginId: schedule.pluginId,
    installationId: schedule.installationId,
    name: schedule.name,
    action: schedule.action,
    parameters: schedule.parameters,
    cron: schedule.cronExpression,
    timeZone: schedule.timeZone,
    enabled: schedule.isActive,
    disabledReason: schedule.disabledReason,
    nextRunAt: schedule.nextRunTimestamp,
    lastRun: lastRun && {
      executionId: lastRun.id,
      status: lastRun.status,
      errorCode: lastRun.errorCode,
      finishedAt: lastRun.finishedAt,
    },
    createdAt: schedule.createdAt,
    modifiedAt: schedule.modifiedAt,
  };
}

export function toMemberPluginScheduleResponse(
  view: PluginScheduleView
): MemberPluginScheduleApiDto {
  return {
    id: view.id,
    name: view.name,
    action: view.action,
    cron: view.cron,
    timeZone: view.timeZone,
    enabled: view.enabled,
    disabledReason: view.disabledReason,
    nextRunAt: view.nextRunAt?.toISOString() ?? null,
    lastRun: view.lastRun && {
      executionId: view.lastRun.executionId,
      status: view.lastRun.status,
      errorCode: view.lastRun.errorCode,
      finishedAt: view.lastRun.finishedAt?.toISOString() ?? null,
    },
    createdAt: view.createdAt.toISOString(),
    modifiedAt: view.modifiedAt.toISOString(),
  };
}

export function toPluginScheduleResponse(view: PluginScheduleView): PluginScheduleApiDto {
  return { ...toMemberPluginScheduleResponse(view), parameters: view.parameters };
}

export function toProjectPluginScheduleResponse(
  view: ProjectPluginScheduleView
): ProjectPluginScheduleApiDto {
  return {
    ...toMemberPluginScheduleResponse(view.schedule),
    pluginId: view.schedule.pluginId,
    pluginName: view.pluginName,
    installationId: view.schedule.installationId,
    installationState: view.installationState,
    owner: view.owner,
    ownerIsMember: view.ownerIsMember,
    canManage: view.canManage,
  };
}
