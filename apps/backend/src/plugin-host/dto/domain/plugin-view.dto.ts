import { PluginPublicationScope } from '../../enums/plugin-publication-scope.enum';

/**
 * Where a plugin comes from, as far as a member is allowed to know.
 *
 * A private repository discloses its owner and nothing else: the repository name and
 * URL would tell a member that a specific private repository exists.
 */
export interface PluginSourceDto {
  readonly ownerName: string;
  readonly ownerUrl: string;
  readonly repositoryUrl?: string;
}

export type PluginInstallationState = 'not_installed' | 'installed' | 'uninstalled';

/**
 * What a member sees in the Gallery or on a plugin page.
 *
 * Deliberately carries no delivery URL, commit, GitHub access mode or sync diagnostics.
 * Those are source diagnostics, available only through publisher-management operations.
 */
export interface PluginGalleryEntryDto {
  readonly pluginId: string;
  readonly displayName: string;
  readonly description: string;
  readonly currentSemver: string | null;
  /**
   * Opaque id of the current version, not a source diagnostic.
   *
   * Installing confirms an id rather than a SemVer: two records can carry the same
   * number, and confirming the number would let a stale screen pass against a
   * different version than the one it displayed.
   */
  readonly currentVersionId: string | null;
  /** Which authority levels make this visible. Informational; there is no precedence. */
  readonly visibleViaScopes: PluginPublicationScope[];
  readonly suspended: boolean;
  readonly installationState: PluginInstallationState;
  readonly source: PluginSourceDto;
  /**
   * When OWOX first learned of this plugin, so a Gallery can order by newest.
   *
   * Deliberately the plugin record's own date, not the publication's: a plugin already
   * known to the deployment is not new to it because one more member listed it.
   */
  readonly addedAt: string;
  /**
   * When this deployment checks GitHub for a newer version on its own, ISO-8601.
   *
   * Null while the plugin is off daily maintenance -- nothing publishes or installs it,
   * so nothing depends on it being current. Publishing or installing it puts it back.
   */
  readonly nextCheckAt: string | null;
}
