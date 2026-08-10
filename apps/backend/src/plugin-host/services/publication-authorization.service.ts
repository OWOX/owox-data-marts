import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp/types/auth.types';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PublicationAuthorizationError } from '../errors/plugin-host.errors';

/**
 * Who may manage publications at which authority level.
 *
 * The project and member identities always come from the authenticated context and are
 * never taken from the request -- otherwise an admin of one project could publish into
 * another, and a member could publish on someone else's behalf.
 */
@Injectable()
export class PublicationAuthorizationService {
  constructor(private readonly config: PluginHostConfigService) {}

  /** @throws {PublicationAuthorizationError} */
  assertMayManage(scope: PluginPublicationScope, context: AuthorizationContext): void {
    switch (scope) {
      case PluginPublicationScope.DEPLOYMENT:
        if (!this.isDeploymentPublisher(context)) {
          throw new PublicationAuthorizationError(
            scope,
            'Publishing to the whole deployment is limited to allowlisted publisher API keys'
          );
        }
        return;

      case PluginPublicationScope.PROJECT:
        if (!context.roles?.includes('admin')) {
          throw new PublicationAuthorizationError(
            scope,
            'Publishing to this project is limited to Project Admins'
          );
        }
        return;

      case PluginPublicationScope.MEMBER:
        if (!context.userId) {
          throw new PublicationAuthorizationError(
            scope,
            'A personal publication needs an identified member'
          );
        }
        return;

      default:
        throw new PublicationAuthorizationError(
          String(scope),
          `Unknown publication scope: ${String(scope)}`
        );
    }
  }

  /**
   * True only for a key explicitly listed in the deployment allowlist.
   *
   * An unset allowlist yields an empty list, so this is false for everyone. Reading it
   * as "unrestricted" would hand deployment-wide publishing to every API key.
   */
  isDeploymentPublisher(context: AuthorizationContext): boolean {
    return (
      context.apiKeyId !== undefined &&
      this.config.deploymentPublisherApiKeyIds.includes(context.apiKeyId)
    );
  }
}
