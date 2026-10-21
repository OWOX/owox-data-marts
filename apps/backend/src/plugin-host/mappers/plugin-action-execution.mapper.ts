import type { PluginActionExecutionView } from '../dto/domain/plugin-action-execution.dto';
import type { PluginRunView } from '../dto/domain/plugin-run.dto';
import type { PluginRunApiDto } from '../dto/presentation/plugin-run-api.dto';
import {
  isFinalPluginActionStatus,
  PluginActionExecutionStatus,
} from '../enums/plugin-action-execution-status.enum';
import type { PluginActionExecutionSummary } from '../services/plugin-action-execution.service';

export function toPluginActionExecutionView(
  execution: PluginActionExecutionSummary
): PluginActionExecutionView {
  const failed =
    isFinalPluginActionStatus(execution.status) &&
    execution.status !== PluginActionExecutionStatus.SUCCEEDED;
  return {
    id: execution.id,
    action: execution.action,
    status: execution.status,
    trigger: execution.trigger,
    scheduleId: execution.scheduleId,
    startedAt: execution.startedAt,
    deadlineAt: execution.deadlineAt,
    finishedAt: execution.finishedAt,
    result: execution.status === PluginActionExecutionStatus.SUCCEEDED ? execution.result : null,
    // CANCELLED and TIMED_OUT rows store no code, so the status is the code.
    error: failed
      ? { code: execution.errorCode ?? execution.status, message: execution.errorMessage ?? '' }
      : null,
  };
}

export function toPluginRunResponse(view: PluginRunView): PluginRunApiDto {
  return {
    id: view.id,
    pluginId: view.pluginId,
    pluginName: view.pluginName,
    pluginVersion: view.pluginVersion,
    action: view.action,
    status: view.status,
    trigger: view.trigger,
    scheduleId: view.scheduleId,
    scheduleName: view.scheduleName,
    owner: view.owner,
    timeLimitSeconds: view.timeLimitSeconds,
    errorCode: view.errorCode,
    errorMessage: view.errorMessage,
    errorMessageCleared: view.errorMessageCleared,
    canCancel: view.canCancel,
    createdAt: view.createdAt.toISOString(),
    queuedAt: view.queuedAt?.toISOString() ?? null,
    startedAt: view.startedAt?.toISOString() ?? null,
    finishedAt: view.finishedAt?.toISOString() ?? null,
  };
}
