export enum PluginActionExecutionStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMED_OUT = 'TIMED_OUT',
}

export type PluginActionTrigger = 'frontend' | 'schedule';

const FINAL_STATUSES: ReadonlySet<string> = new Set([
  PluginActionExecutionStatus.SUCCEEDED,
  PluginActionExecutionStatus.FAILED,
  PluginActionExecutionStatus.CANCELLED,
  PluginActionExecutionStatus.TIMED_OUT,
]);

export function isFinalPluginActionStatus(status: string): boolean {
  return FINAL_STATUSES.has(status);
}
