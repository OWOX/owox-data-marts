import { formatDateShort } from '../../utils/date-formatters';
import type { PluginRunStatus, PluginScheduleDisabledReason, PluginScheduleSummary } from './types';

export const SCHEDULE_DISABLED_REASON_TEXT: Record<PluginScheduleDisabledReason, string> = {
  ACTION_NOT_DECLARED: 'The plugin no longer has this action',
  INVALID_PARAMETERS: 'Its settings no longer match the action',
  PAUSED_BY_ADMIN: 'A project admin paused this schedule',
};

export const SCHEDULE_OWNER_NOT_MEMBER_TEXT =
  'The owner is no longer a project member, or their account is locked, so its runs are skipped';

export const PLUGIN_RUN_STATUS_LABEL: Record<PluginRunStatus, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  TIMED_OUT: 'Timed out',
};

export const PLUGIN_RUN_STATUSES = Object.keys(PLUGIN_RUN_STATUS_LABEL) as PluginRunStatus[];

export function isPluginRunStatus(value: string): value is PluginRunStatus {
  return (PLUGIN_RUN_STATUSES as string[]).includes(value);
}

/** A run that has not finished: the lists poll while one is shown. */
export function isOpenRunStatus(status: string): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}

/** A status this build does not know yet shows as the API sent it. */
export function runStatusLabel(status: string): string {
  return isPluginRunStatus(status) ? PLUGIN_RUN_STATUS_LABEL[status] : status;
}

/** The run's status, its error code and when it finished, in the schedule's own zone. */
export function lastRunSummary(
  lastRun: NonNullable<PluginScheduleSummary['lastRun']>,
  timeZone: string
): string {
  const code = lastRun.errorCode ? ` (${lastRun.errorCode})` : '';
  const when = lastRun.finishedAt ? ` · ${formatDateShort(lastRun.finishedAt, { timeZone })}` : '';
  return `${runStatusLabel(lastRun.status)}${code}${when}`;
}
