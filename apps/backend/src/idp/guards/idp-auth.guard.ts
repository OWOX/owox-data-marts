import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Express, Request } from 'express';
import { IIdpProvider, TokenPayload } from '@owox/idp-protocol';
import { Reflector } from '@nestjs/core';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  payload?: TokenPayload;
  project?: {
    id: string;
    name?: string;
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
    const idpProvider: IIdpProvider | undefined = app.get('idp') as IIdpProvider;

    if (!idpProvider) {
      throw new UnauthorizedException('No IDP provider found');
    }

    try {
      const token = request.headers.authorization || '';
      const tokenPayload = await idpProvider.verifyToken(token);
      if (!tokenPayload) {
        throw new UnauthorizedException('Invalid authorization');
      }

      request.payload = tokenPayload;
      request.user = {
        id: tokenPayload.sub,
        email: tokenPayload.email,
        name: tokenPayload.name,
      };
      request.project = {
        id: tokenPayload.projectId,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Authentication failed');
    }

    return true;
  }
}
