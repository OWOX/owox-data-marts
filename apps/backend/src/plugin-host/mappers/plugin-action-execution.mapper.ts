import type { PluginActionExecutionView } from '../dto/domain/plugin-action-execution.dto';
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
