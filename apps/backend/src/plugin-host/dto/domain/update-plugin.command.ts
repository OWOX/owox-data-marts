import { AuthorizationContext } from '../../../idp/types/auth.types';
import { PluginUpdateCheckOutcome } from '../../use-cases/run-plugin-update-check.service';
import { PluginPublisherDiagnosticsDto } from './plugin-publication.dto';

/**
 * Check now: a member-requested acceleration of the deployment's managed update check.
 *
 * Exactly one of `pluginId` (member web UI) or `repoLocator` (CLI / api-client) is set.
 * Repository form uses cached owner/name identity, same normalization as publish.
 */
export class UpdatePluginCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly pluginId?: string,
    readonly repoLocator?: string
  ) {}
}

export interface PluginUpdateResultDto {
  readonly pluginId: string;
  readonly repository: string;
  readonly currentVersionId: string | null;
  readonly currentSemver: string | null;
  /** What the check did. The four member-facing outcomes are distinguished here. */
  readonly outcome: PluginUpdateCheckOutcome;
  /** Kept as the plain question "did the version move". `outcome` says more. */
  readonly updated: boolean;
  /** When this deployment checks again on its own, ISO-8601. */
  readonly nextCheckAt: string | null;
  /**
   * Set for deployment publishers (management). Omitted for ordinary members so
   * rejection detail stays off the member-facing path (§6.2 / §16).
   */
  readonly diagnostics: PluginPublisherDiagnosticsDto | null;
}
