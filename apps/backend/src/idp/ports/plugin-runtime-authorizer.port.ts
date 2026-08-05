export interface PluginRuntimeIdentity {
  readonly pluginId: string;
  readonly installationId: string;
  readonly projectId: string;
  readonly userId: string;
}

export const PLUGIN_RUNTIME_AUTHORIZER = Symbol('PLUGIN_RUNTIME_AUTHORIZER');

/**
 * Live authorization boundary for installation-bound plugin runtime tokens.
 */
export interface PluginRuntimeAuthorizerPort {
  assertActiveInstallation(identity: PluginRuntimeIdentity): Promise<void>;
}
