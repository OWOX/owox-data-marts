import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from './idp-auth.guard';
import { AuthorizationError, Role } from '@owox/idp-protocol';

@Injectable()
export class IdpRoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (!request.idpContext?.roles) {
      throw new AuthorizationError('Access denied: No roles information available');
    }

    const hasRequiredRole = requiredRoles.some(role =>
      request.idpContext.roles?.includes(role as Role)
    );

    if (!hasRequiredRole) {
      throw new AuthorizationError(`Access denied. Required role: ${requiredRoles.join(' or ')}`);
    }

    return true;
  }
}
