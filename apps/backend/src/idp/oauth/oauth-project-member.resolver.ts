import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { McpOAuthProjectMemberContext } from '@owox/idp-protocol';
import type { AuthorizationContext } from '../types';

@Injectable()
export class OAuthProjectMemberResolver {
  resolve(context: AuthorizationContext | undefined): McpOAuthProjectMemberContext {
    if (!context?.userId || !context.projectId) {
      throw new UnauthorizedException('User must be authenticated in a project context');
    }
    if (!context.roles || context.roles.length === 0) {
      throw new UnauthorizedException('User must be an active project member');
    }

    return {
      userId: context.userId,
      projectId: context.projectId,
      roles: context.roles,
      email: context.email,
      fullName: context.fullName,
      avatar: context.avatar,
    };
  }
}
