import { AuthorizationContext } from '../../../idp/types/auth.types';
import { ReleaseRejectionCode } from '../../enums/release-rejection-code.enum';

/** A dry run of release acceptance for one ref. Records nothing. */
export class CheckPluginReleaseCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly repoLocator: string,
    readonly ref: string,
    readonly version?: string
  ) {}
}

export interface PluginReleaseCheckIssueDto {
  readonly code: ReleaseRejectionCode;
  readonly detail: string;
}

export interface PluginReleaseCheckResultDto {
  readonly pluginId: string;
  readonly repository: string;
  readonly commitSha: string | null;
  readonly candidateVersion: string | null;
  readonly baselineVersion: string | null;
  readonly collectionsEvaluated: boolean;
  readonly issues: readonly PluginReleaseCheckIssueDto[];
}
