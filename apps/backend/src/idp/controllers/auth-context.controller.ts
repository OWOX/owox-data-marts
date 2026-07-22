import { Controller, Get } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext } from '../decorators';
import { AuthorizationContext, Role, Strategy } from '../types';

@Controller('auth/context')
@ApiTags('Authentication')
export class AuthContextController {
  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Get()
  @ApiOperation({ summary: 'Get the current auth context' })
  @ApiHeader({ name: 'X-OWOX-Authorization', required: true })
  @ApiHeader({
    name: 'X-OWOX-Api-Key-Id',
    required: false,
    description:
      'Required when X-OWOX-Authorization contains an API-key access token; must match the token API key ID.',
  })
  @ApiOkResponse({
    description: 'Auth context resolved by the backend auth guard.',
    schema: {
      type: 'object',
      required: ['userId', 'projectId'],
      properties: {
        userId: { type: 'string' },
        projectId: { type: 'string' },
        email: { type: 'string', nullable: true },
        fullName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
        roles: { type: 'array', items: { type: 'string', enum: ['admin', 'editor', 'viewer'] } },
        projectTitle: { type: 'string', nullable: true },
        authFlow: { type: 'string', nullable: true },
        apiKeyId: { type: 'string', nullable: true },
      },
    },
  })
  getContext(@AuthContext() context: AuthorizationContext): AuthorizationContext {
    return {
      userId: context.userId,
      projectId: context.projectId,
      email: context.email,
      fullName: context.fullName,
      avatar: context.avatar,
      roles: context.roles,
      projectTitle: context.projectTitle,
      authFlow: context.authFlow,
      apiKeyId: context.apiKeyId,
    };
  }
}
