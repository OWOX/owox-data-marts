import type { Role } from '@owox/idp-protocol';

export interface PluginRuntimeIdentity {
  readonly pluginId: string;
  readonly installationId: string;
  readonly projectId: string;
  readonly userId: string;
}

/** A running plugin backend action, resolved from its execution token. */
export interface PluginExecutionIdentity extends PluginRuntimeIdentity {
  readonly executionId: string;
  /** The owner's role when the execution started, not a live read. */
  readonly role: Role;
}

export const PLUGIN_RUNTIME_AUTHORIZER = Symbol('PLUGIN_RUNTIME_AUTHORIZER');

/**
 * Live authorization boundary for installation-bound plugin runtime tokens.
 */
export interface PluginRuntimeAuthorizerPort {
  assertActiveInstallation(identity: PluginRuntimeIdentity): Promise<void>;
  /** Null unless the token belongs to a RUNNING execution whose deadline has not passed. */
  resolveExecutionToken(token: string): Promise<PluginExecutionIdentity | null>;
}
