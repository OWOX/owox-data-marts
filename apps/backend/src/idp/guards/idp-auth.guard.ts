import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticationError, Role } from '@owox/idp-protocol';
import { Reflector } from '@nestjs/core';
import { AuthMethod } from '../types/auth.types';
import { IdpProviderService } from '../services/idp-provider.service';

export interface AuthenticatedRequest extends Request {
  idpContext: {
    userId: string;
    projectId: string;

    email?: string;
    fullName?: string;
    roles?: Role[];

    projectTitle?: string;
  };
}

@Injectable()
export class IdpAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private idpProviderService: IdpProviderService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isOptional = this.reflector.getAllAndOverride<boolean>('isOptionalAuth', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isOptional) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const idpProvider = this.idpProviderService.getProvider(request);

    try {
      const token = request.headers.authorization || '';
      const authMethod = this.reflector.getAllAndOverride<AuthMethod>('authMethod', [
        context.getHandler(),
        context.getClass(),
      ]);

      const tokenPayload =
        authMethod === 'parse'
          ? await idpProvider.parseToken(token)
          : await idpProvider.introspectToken(token);

      if (!tokenPayload) {
        throw new AuthenticationError('Invalid authorization');
      }

      request.idpContext = {
        userId: tokenPayload.userId,
        projectId: tokenPayload.projectId,
        email: tokenPayload.email,
        fullName: tokenPayload.fullName,
        roles: tokenPayload.roles,
        projectTitle: tokenPayload.projectTitle,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new AuthenticationError('Authentication failed');
    }

    return true;
  }
}
