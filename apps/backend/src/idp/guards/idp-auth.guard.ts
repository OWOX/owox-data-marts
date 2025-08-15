import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Express, Request } from 'express';
import { AuthenticationError, IdpProvider, Role } from '@owox/idp-protocol';
import { Reflector } from '@nestjs/core';

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
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isOptional = this.reflector.getAllAndOverride<boolean>('isOptionalAuth', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isOptional) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const app = request.app as Express;
    const idpProvider: IdpProvider | undefined = app.get('idp') as IdpProvider;

    if (!idpProvider) {
      throw new AuthenticationError('No IDP provider found');
    }

    try {
      const token = request.headers.authorization || '';
      const tokenPayload = await idpProvider.introspectToken(token);
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
