/**
 * The one thing plugin runtime authorization needs from this module.
 *
 * Deliberately a single read-only method. The runtime authorization track owns the
 * consumer and can be built and merged against this interface alone; until the
 * implementation below is bound, nothing is bound, and the correct behaviour then is to
 * reject every plugin runtime token rather than accept one it cannot verify.
 */
export interface PluginInstallationSnapshot {
  readonly installationId: string;
  readonly pluginId: string;
  readonly projectId: string;
  readonly userId: string;
  /** Installed and not soft-uninstalled. */
  readonly isActive: boolean;
  /** Deployment-wide plugin suspension. */
  readonly isSuspended: boolean;
}

export const PLUGIN_INSTALLATION_LOOKUP = Symbol('PLUGIN_INSTALLATION_LOOKUP');

export interface PluginInstallationLookupPort {
  findSnapshot(installationId: string): Promise<PluginInstallationSnapshot | null>;
}
