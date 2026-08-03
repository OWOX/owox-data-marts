import { AuthorizationContext } from '../../../idp/types/auth.types';
import { PluginPublicationScope } from '../../enums/plugin-publication-scope.enum';

/**
 * Which projects a deployment publication reaches.
 *
 * Exactly one form must be chosen; there is no implicit all-projects default, and the
 * two can never be combined in one command.
 */
export interface DeploymentAudience {
  readonly projectIds?: string[];
  readonly allProjects?: boolean;
}

export class PublishPluginCommand {
  constructor(
    readonly repoLocator: string,
    readonly scope: PluginPublicationScope,
    /** Project and member identity come from here, never from the request body. */
    readonly context: AuthorizationContext,
    readonly audience: DeploymentAudience = {}
  ) {}
}

export class UnpublishPluginCommand {
  constructor(
    readonly repoLocator: string,
    readonly scope: PluginPublicationScope,
    readonly context: AuthorizationContext,
    readonly audience: DeploymentAudience = {}
  ) {}
}
