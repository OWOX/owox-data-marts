import type { PluginActionExecutionStatus } from '../../enums/plugin-action-execution-status.enum';
import type { PluginScheduleDisabledReason } from '../../enums/plugin-action-schedule.enum';

export interface PluginScheduleDraft {
  readonly action: string;
  /** Undefined is stored as null. */
  readonly parameters: unknown;
  readonly cron: string;
  readonly timeZone: string;
  readonly name: string | null;
}

export type PluginSchedulePatch = Partial<PluginScheduleDraft>;

export interface PluginScheduleOwner {
  readonly installationId: string;
  readonly pluginId: string;
  readonly projectId: string;
}

export interface PluginScheduleLastRun {
  readonly executionId: string;
  readonly status: PluginActionExecutionStatus;
  readonly errorCode: string | null;
  readonly finishedAt: Date | null;
}

export interface PluginScheduleView {
  readonly id: string;
  readonly pluginId: string;
  readonly installationId: string;
  readonly name: string | null;
  readonly action: string;
  readonly parameters: unknown;
  readonly cron: string;
  readonly timeZone: string;
  readonly enabled: boolean;
  readonly disabledReason: PluginScheduleDisabledReason | null;
  readonly nextRunAt: Date | null;
  readonly lastRun: PluginScheduleLastRun | null;
  readonly createdAt: Date;
  readonly modifiedAt: Date;
}
