export type PluginPublicationScope = 'deployment' | 'project' | 'member';

export type PluginInstallationState = 'not_installed' | 'installed' | 'uninstalled';

/**
 * Where a plugin comes from, as far as a member is allowed to know.
 *
 * A private repository has no repositoryUrl: naming it would confirm that one specific
 * private repository exists.
 */
export interface PluginSource {
  ownerName: string;
  ownerUrl: string;
  repositoryUrl?: string;
}

/**
 * Mirrors the member-facing backend response exactly.
 *
 * There is deliberately no delivery URL, commit or sync diagnostics here -- those are
 * publisher-only, and the only place a delivery URL reaches the browser is the runtime
 * entry endpoint below.
 */
export interface PluginGalleryEntry {
  pluginId: string;
  displayName: string;
  description: string;
  currentSemver: string | null;
  /** Installing confirms this id: two versions can share a SemVer. */
  currentVersionId: string | null;
  /** Why this is visible. Informational: the levels are independent, with no precedence. */
  visibleViaScopes: PluginPublicationScope[];
  suspended: boolean;
  installationState: PluginInstallationState;
  source: PluginSource;
  /**
   * When OWOX first learned of this plugin. Backs the "Newest" ordering.
   *
   * Optional because a backend older than this build does not send it, and the browser
   * can be the newer half of a rolling deploy. Ordering degrades; nothing breaks.
   */
  addedAt?: string;
  /**
   * When this deployment checks GitHub for a newer version on its own.
   *
   * Null while nothing publishes or installs the plugin, which takes it off daily
   * maintenance. Optional for the same rolling-deploy reason as addedAt.
   */
  nextCheckAt?: string | null;
}

export interface InstalledPlugin extends PluginGalleryEntry {
  installationId: string;
  installedAt: string;
  uninstalledAt: string | null;
}

export interface PluginEntryPoint {
  deliveryUrl: string;
  displayName: string;
  /** Stable across releases, renames and transfers -- unlike versionId. */
  pluginId: string;
  versionId: string;
}

export interface PluginRuntimeToken {
  runtimeToken: string;
  /** Seconds. The bridge re-mints ahead of this rather than waiting for a 401. */
  expiresIn: number;
}

export interface PluginInstallation {
  installationId: string;
  pluginId: string;
  createdAt: string;
  installedAt: string;
  uninstalledAt: string | null;
}

/**
 * What the deployment's managed check did.
 *
 * `already_running` means another check for this plugin is recent or in flight and its
 * result stands; `failed` means the current version is still active and the deployment
 * tries again at its next daily check.
 */
export type PluginUpdateOutcome = 'updated' | 'up_to_date' | 'already_running' | 'failed';

export interface PluginUpdateResult {
  pluginId: string;
  repository?: string;
  currentVersionId: string | null;
  currentSemver: string | null;
  /** Optional for the same rolling-deploy reason as addedAt; `updated` is the fallback. */
  outcome?: PluginUpdateOutcome;
  /** False when nothing newer was found -- a normal outcome, not a failure. */
  updated: boolean;
  /** When the deployment checks again on its own. Asking now does not move it. */
  nextCheckAt?: string | null;
}

export interface PluginPublication {
  publicationId: string;
  pluginId: string;
  /** Canonical `owner/name`. Unpublish addresses a publication by this, not by id. */
  repository: string;
  scope: PluginPublicationScope;
  isActive: boolean;
  allProjects: boolean;
  audienceProjectIds: string[];
  currentSemver: string | null;
  /** Publisher management diagnostics; present on management API responses. */
  diagnostics?: {
    deliveryUrl: string | null;
    commitSha: string | null;
    accessMode: string | null;
    syncedAt: string | null;
    acceptedSemvers: string[];
    unchangedSemvers: string[];
    rejections: {
      tagName: string;
      githubReleaseId: string | null;
      code: string;
      detail: string;
    }[];
  };
}

export interface PublishPluginRequest {
  repository: string;
  scope: PluginPublicationScope;
}
