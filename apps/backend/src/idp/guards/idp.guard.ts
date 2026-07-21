import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import {
  AuthenticationError,
  AuthorizationError,
  isSafeHttpMethodForViewOnly,
  isViewOnlyPayload,
  Payload,
  Role as RoleType,
  ViewOnlyModeError,
} from '@owox/idp-protocol';
import { IdpProjectionsService } from '../services/idp-projections.service';
import { Strategy } from '../types';
import type { RoleConfig } from '../types';
import { Reflector } from '@nestjs/core';
import { IdpProviderService } from '../services/idp-provider.service';
import { ClsService } from 'nestjs-cls';
import { REJECT_API_KEY_AUTH_METADATA } from '../decorators/reject-api-key-auth.decorator';

export interface AuthenticatedRequest extends Request {
  idpContext: {
    userId: string;
    projectId: string;

    email?: string;
    fullName?: string;
    avatar?: string;

    roles?: RoleType[];

    projectTitle?: string;
    authFlow?: string;
    apiKeyId?: string;
    /** True when the session is in view-only mode. */
    viewOnly?: boolean;
  };
}

export const AUTH_CONTEXT = 'AuthContext';

const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

@Injectable()
export class IdpGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private idpProviderService: IdpProviderService,
    private readonly cls: ClsService,
    private readonly idpProjectionsService: IdpProjectionsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roleConfig = this.reflector.getAllAndOverride<RoleConfig>('roleConfig', [
      context.getHandler(),
      context.getClass(),
    ]);
    const rejectApiKeyAuth = this.reflector.getAllAndOverride<boolean>(
      REJECT_API_KEY_AUTH_METADATA,
      [context.getHandler(), context.getClass()]
    );

    if (!roleConfig) {
      throw new AuthenticationError('No role configuration found');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Role.none() / optional auth: IdpGuard does not parse user tokens and does not
    // apply view-only restrictions. Callers of these routes authenticate outside IDP
    // (e.g. InternalApiGuard service-account tokens, GoogleJwtBody connector JWTs).
    // A user view-only access token is not accepted as credentials on those paths.
    if (roleConfig.optional) {
      return true;
    }

    try {
      const tokenPayload = await this.authenticateUser(request, roleConfig.strategy);
      this.checkApiKeyUsageRestrictions(tokenPayload, Boolean(rejectApiKeyAuth));
      this.checkApiKeyHeaderBinding(request, tokenPayload);
      this.checkViewOnlyRestrictions(request, tokenPayload);

      // Propagate only when true so normal sessions stay free of the flag.
      const viewOnly = isViewOnlyPayload(tokenPayload) || undefined;

      request.idpContext = {
        userId: tokenPayload.userId,
        projectId: tokenPayload.projectId,
        email: tokenPayload.email,
        fullName: tokenPayload.fullName,
        avatar: tokenPayload.avatar,
        roles: tokenPayload.roles,
        projectTitle: tokenPayload.projectTitle,
        authFlow: tokenPayload.authFlow,
        apiKeyId: tokenPayload.apiKeyId,
        viewOnly,
      };

      this.cls.set(AUTH_CONTEXT, {
        userId: tokenPayload.userId,
        projectId: tokenPayload.projectId,
        roles: tokenPayload.roles,
        authFlow: tokenPayload.authFlow,
        apiKeyId: tokenPayload.apiKeyId,
        viewOnly,
      });

      if (request && STATE_CHANGING_METHODS.includes(request.method)) {
        // Update IDP projections in the background
        void this.idpProjectionsService.updateProjectionsFromIdpPayload(tokenPayload);
      }
    } catch (error) {
      // AuthorizationError covers ViewOnlyModeError (subclass) and role/API-key denials.
      if (error instanceof UnauthorizedException || error instanceof AuthorizationError) {
        throw error;
      }
      throw new AuthenticationError('Authentication failed');
    }

    if (roleConfig.role) {
      this.checkRoleAuthorization(request, roleConfig.role);
    }

    return true;
  }

  private async authenticateUser(
    request: AuthenticatedRequest,
    strategy: Strategy
  ): Promise<Payload> {
    const idpProvider = this.idpProviderService.getProvider(request);
    const token = (request.headers['x-owox-authorization'] as string | undefined) ?? '';

    const tokenPayload =
      strategy === Strategy.PARSE
        ? await idpProvider.parseToken(token)
        : await idpProvider.introspectToken(token);

    if (!tokenPayload) {
      throw new AuthenticationError('Invalid authorization');
    }

    return tokenPayload;
  }

  /**
   * Blocks state-changing requests when the session is in view-only mode.
   * Safe methods (GET/HEAD/OPTIONS) remain allowed.
   *
   * Scope: only routes that go through authenticateUser (required @Auth roles).
   * Intentionally NOT applied to Role.none() / optional routes (service or
   * connector auth, not user IDP).
   *
   * MCP is a separate auth path; view-only sessions are blocked from minting
   * MCP tokens in OAuthAuthorizationController so write tools cannot bypass
   * this guard.
   *
   * View-only detection is delegated to idp-protocol so claim resolution can
   * evolve independently of this guard.
   */
  private checkViewOnlyRestrictions(request: AuthenticatedRequest, tokenPayload: Payload): void {
    if (!isViewOnlyPayload(tokenPayload)) {
      return;
    }

    if (isSafeHttpMethodForViewOnly(request.method)) {
      return;
    }

    throw new ViewOnlyModeError();
  }

  private checkApiKeyHeaderBinding(request: AuthenticatedRequest, tokenPayload: Payload): void {
    if (tokenPayload.authFlow !== 'api_key') {
      return;
    }

    const headerValue = request.headers['x-owox-api-key-id'];
    const apiKeyId = Array.isArray(headerValue) ? null : headerValue;

    if (!apiKeyId || !tokenPayload.apiKeyId || apiKeyId !== tokenPayload.apiKeyId) {
      throw new AuthorizationError('Access denied by api key');
    }
  }

  private checkApiKeyUsageRestrictions(tokenPayload: Payload, rejectApiKeyAuth: boolean): void {
    if (tokenPayload.authFlow !== 'api_key') {
      return;
    }

    if (rejectApiKeyAuth) {
      throw new AuthorizationError('API key authentication is not allowed for this endpoint');
    }
  }

  private static readonly ROLE_DISPLAY_NAMES: Record<string, string> = {
    admin: 'Project Admin',
    editor: 'Technical User',
    viewer: 'Business User',
  };

  private checkRoleAuthorization(request: AuthenticatedRequest, requiredRole: RoleType): void {
    if (!request.idpContext?.roles) {
      throw new AuthorizationError('Access denied: No roles information available');
    }

    const roleHierarchy: Record<RoleType, RoleType[]> = {
      viewer: ['viewer', 'editor', 'admin'],
      editor: ['editor', 'admin'],
      admin: ['admin'],
    };

    const acceptableRoles = roleHierarchy[requiredRole];
    const hasRequiredRole = request.idpContext.roles.some(userRole =>
      acceptableRoles.includes(userRole)
    );

    if (!hasRequiredRole) {
      const displayName = IdpGuard.ROLE_DISPLAY_NAMES[requiredRole] ?? requiredRole;
      throw new AuthorizationError(`Access denied. Required role: ${displayName}`);
    }
  }
}
