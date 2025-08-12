import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import { AuthenticatedRequest } from '../guards/idp-auth.guard';
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

    if (request.user?.id && request.project?.id) {
      return {
        projectId: request.project.id,
        userId: request.user.id,
      };
    }

    throw new BadRequestException('Invalid authentication context');
  }
);
