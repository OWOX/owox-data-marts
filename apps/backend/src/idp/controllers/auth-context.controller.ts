import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext } from '../decorators';
import { AuthContextResponseApiDto } from '../dto/presentation/auth-context-response-api.dto';
import { AuthorizationContext, Role, Strategy } from '../types';

@Controller('auth/context')
@ApiTags('Authentication')
export class AuthContextController {
  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Get()
  @ApiOperation({ summary: 'Get the current auth context' })
  @ApiOkResponse({
    description: 'Auth context resolved by the backend auth guard.',
    type: AuthContextResponseApiDto,
  })
  getContext(@AuthContext() context: AuthorizationContext): AuthContextResponseApiDto {
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
