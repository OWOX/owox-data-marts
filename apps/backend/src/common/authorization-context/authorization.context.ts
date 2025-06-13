import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

export interface AuthorizationContext {
  projectId: string;
  userId: string;
}

export const AuthContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthorizationContext => {
    const fillStub =
      process.env.FILL_AUTH_CONTEXT === undefined || process.env.FILL_AUTH_CONTEXT === '1';

    if (fillStub) {
      return { projectId: '0', userId: '0' };
    }

    const request = ctx.switchToHttp().getRequest();

    const projectId = request.headers['x-project'];
    const userId = request.headers['x-user'];

    if (!userId) {
      throw new BadRequestException('Missing X-User header');
    }

    if (!projectId) {
      throw new BadRequestException('Missing X-Project header');
    }

    return { projectId, userId };
  }
);
