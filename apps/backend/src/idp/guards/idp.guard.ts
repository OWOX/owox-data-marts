import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import {
  AuthenticationError,
  AuthorizationError,
  Payload,
  Role as RoleType,
} from '@owox/idp-protocol';
import { Strategy } from '../types/role-config.types';
import type { RoleConfig } from '../types/role-config.types';
import { Reflector } from '@nestjs/core';
import { IdpProviderService } from '../services/idp-provider.service';

export interface AuthenticatedRequest extends Request {
  idpContext: {
    userId: string;
    projectId: string;

    email?: string;
    fullName?: string;
    avatar?: string;

    roles?: RoleType[];

    projectTitle?: string;
  };
}

@Injectable()
export class IdpGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private idpProviderService: IdpProviderService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roleConfig = this.reflector.getAllAndOverride<RoleConfig>('roleConfig', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roleConfig) {
      throw new AuthenticationError('No role configuration found');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (roleConfig.optional) {
      return true;
    }

    try {
      const tokenPayload = await this.authenticateUser(request, roleConfig.strategy);

      request.idpContext = {
        userId: tokenPayload.userId,
        projectId: tokenPayload.projectId,
        email: tokenPayload.email,
        fullName: tokenPayload.fullName,
        avatar: tokenPayload.avatar,
        roles: tokenPayload.roles,
        projectTitle: tokenPayload.projectTitle,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
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
    const token = request.headers.authorization || '';

    const tokenPayload =
      strategy === Strategy.PARSE
        ? await idpProvider.parseToken(token)
        : await idpProvider.introspectToken(token);

    if (!tokenPayload) {
      throw new AuthenticationError('Invalid authorization');
    }

    return tokenPayload;
  }

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
      throw new AuthorizationError(`Access denied. Required role: ${requiredRole}`);
    }
  }
}
