import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import { AuthenticatedRequest } from '../guards/idp.guard';
import { AuthorizationContext } from '../types/index';

/**
 * AuthContext decorator that works with IDP authentication
 *
 * @example
 * ```typescript
 * @Auth()
 * @Get()
 * async list(@AuthContext() context: AuthorizationContext) {
 *   return this.service.findByProjectAndUser(context.projectId, context.userId);
 * }
 * ```
 */
export const AuthContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthorizationContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.idpContext) {
      return {
        projectId: request.idpContext.projectId,
        userId: request.idpContext.userId,
        fullName: request.idpContext.fullName,
        avatar: request.idpContext.avatar,
        email: request.idpContext.email,
        roles: request.idpContext.roles,
      };
    }

    throw new BadRequestException('Invalid authentication context');
  }
);
