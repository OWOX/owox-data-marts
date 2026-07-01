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

    return getAuthorizationContext(request);
  }
);

export function getAuthorizationContext(request: AuthenticatedRequest): AuthorizationContext {
  if (request.idpContext) {
    return {
      projectId: request.idpContext.projectId,
      userId: request.idpContext.userId,
      fullName: request.idpContext.fullName,
      avatar: request.idpContext.avatar,
      email: request.idpContext.email,
      roles: request.idpContext.roles,
      projectTitle: request.idpContext.projectTitle,
      authFlow: request.idpContext.authFlow,
      apiKeyId: request.idpContext.apiKeyId,
    };
  }

  throw new BadRequestException('Invalid authentication context');
}
