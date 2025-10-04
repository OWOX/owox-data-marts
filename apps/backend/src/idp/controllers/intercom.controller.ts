import { Controller, Post, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { Auth } from '../decorators';
import { AuthContext } from '../decorators';
import type { AuthorizationContext } from '../types';
import { Role, Strategy } from '../types';

@ApiTags('Intercom')
@Controller('intercom')
export class IntercomController {
  constructor(private readonly config: ConfigService) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Post('jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Returns Intercom user verification JWT' })
  @ApiOkResponse({
    description: 'JWT token',
    schema: { example: { token: 'eyJhbGciOiJIUzI1NiIsInR5...' } },
  })
  @ApiBadRequestResponse({ description: 'Missing INTERCOM_SECRET_KEY' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async issueJwt(@AuthContext() ctx: AuthorizationContext): Promise<{ token: string }> {
    const secret = (this.config.get<string>('INTERCOM_SECRET_KEY') || '').trim();
    if (!secret) {
      throw new BadRequestException('INTERCOM_SECRET_KEY is not configured');
    }

    const payload: Record<string, unknown> = {
      user_id: ctx.userId,
      email: ctx.email,
    };

    const token = jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '1h' });
    return { token };
  }
}
