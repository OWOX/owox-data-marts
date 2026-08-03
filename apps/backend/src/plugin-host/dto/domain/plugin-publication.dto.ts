import { GithubAccessMode } from '../../enums/github-access-mode.enum';
import { PluginPublicationScope } from '../../enums/plugin-publication-scope.enum';
import { ReleaseRejectionDto } from './plugin-sync.dto';

/**
 * Source diagnostics for callers who may manage the publication (§6.2 / §16).
 *
 * Never attached to member-facing Gallery or installation responses.
 */
export interface PluginPublisherDiagnosticsDto {
  readonly deliveryUrl: string | null;
  readonly commitSha: string | null;
  readonly accessMode: GithubAccessMode | null;
  readonly syncedAt: string | null;
  readonly acceptedSemvers: string[];
  readonly unchangedSemvers: string[];
  readonly rejections: ReleaseRejectionDto[];
}

export interface PluginPublicationDto {
  readonly publicationId: string;
  readonly pluginId: string;
  /**
   * Canonical `owner/name`, which is what unpublish takes.
   *
   * Without it a caller holding a publication cannot address it: the member-facing
   * repository URL is deliberately withheld for private repositories, which is exactly
   * the case where a publisher still has to be able to withdraw their own listing.
   */
  readonly repository: string;
  readonly scope: PluginPublicationScope;
  readonly isActive: boolean;
  readonly allProjects: boolean;
  readonly audienceProjectIds: string[];
  readonly currentSemver: string | null;
  /** Present on every management response; empty arrays when nothing was synced yet. */
  readonly diagnostics: PluginPublisherDiagnosticsDto;
}
