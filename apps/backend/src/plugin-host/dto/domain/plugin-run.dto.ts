import type { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import type {
  PluginActionExecutionStatus,
  PluginActionTrigger,
} from '../../enums/plugin-action-execution-status.enum';

/** Run History filters; null and an empty list mean any. */
export interface PluginRunFilter {
  readonly statuses: readonly PluginActionExecutionStatus[];
  readonly trigger: PluginActionTrigger | null;
  readonly pluginId: string | null;
  readonly scheduleId: string | null;
  readonly userId: string | null;
}

/** The last row of the previous page. */
export interface PluginRunCursor {
  readonly createdAt: Date;
  readonly id: string;
}

/** One Run History row; input, result and the token hash are never part of it. */
export interface PluginRunView {
  readonly id: string;
  readonly pluginId: string;
  /** The current version's display name; the plugin id once the plugin row is gone. */
  readonly pluginName: string;
  /** The semver of the version the run used; null once that version row is gone. */
  readonly pluginVersion: string | null;
  readonly action: string;
  readonly status: PluginActionExecutionStatus;
  readonly trigger: PluginActionTrigger;
  readonly scheduleId: string | null;
  /** The schedule's name, or its action when unnamed; null once the schedule is gone. */
  readonly scheduleName: string | null;
  readonly owner: UserProjectionDto | null;
  readonly createdAt: Date;
  readonly queuedAt: Date | null;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  /** deadlineAt − startedAt; null before the start. */
  readonly timeLimitSeconds: number | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly errorMessageCleared: boolean;
  readonly canCancel: boolean;
}

export interface PluginRunPage {
  readonly items: PluginRunView[];
  readonly nextCursor: string | null;
}
