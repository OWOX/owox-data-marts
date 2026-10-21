import type {
  PluginActionExecutionStatus,
  PluginActionTrigger,
} from '../../enums/plugin-action-execution-status.enum';
import type { PluginCredentialHandleDto } from './plugin-installation.dto';

export interface StartedPluginActionExecution {
  readonly id: string;
  readonly status: PluginActionExecutionStatus.RUNNING;
}

/** What a plugin page or backend may read about an execution: never its input or token. */
export interface PluginActionExecutionView {
  readonly id: string;
  readonly action: string;
  readonly status: PluginActionExecutionStatus;
  readonly trigger: PluginActionTrigger;
  /** The schedule that started the execution; null for a start from the plugin page. */
  readonly scheduleId: string | null;
  readonly startedAt: Date | null;
  readonly deadlineAt: Date | null;
  readonly finishedAt: Date | null;
  /** SUCCEEDED only; null once payloads are cleared. */
  readonly result: unknown;
  /** FAILED, CANCELLED and TIMED_OUT only. */
  readonly error: { readonly code: string; readonly message: string } | null;
}

/** What a backend action reads about its own execution. */
export interface PluginActionWorkerContext {
  readonly executionId: string;
  readonly action: string;
  readonly input: unknown;
  readonly trigger: PluginActionTrigger;
  readonly scheduleId: string | null;
  readonly deadlineAt: Date;
  /** The plugin the execution belongs to. */
  readonly plugin: { readonly id: string; readonly repositoryId: string };
  /** The release the execution started on. */
  readonly pluginVersion: string;
  readonly installationId: string;
  readonly projectId: string;
  readonly userId: string;
  /** The exact Credentials of the plugin's current release; AI Credentials are not available here. */
  readonly credentialHandles: PluginCredentialHandleDto[];
}
