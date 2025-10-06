import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type { IntercomToken } from '../types/intercom-token.types';
import type { IssueIntercomJwtCommand } from '../dto/domain/issue-intercom-jwt.command';

@Injectable()
export class IssueIntercomJwtService {
  constructor(private readonly config: ConfigService) {}

  async run(command: IssueIntercomJwtCommand): Promise<IntercomToken> {
    const secret = (this.config.get<string>('INTERCOM_SECRET_KEY') || '').trim();
    if (!secret) {
      throw new BadRequestException('INTERCOM_SECRET_KEY is not configured');
    }

    const { userId } = command;

    const payload: Record<string, unknown> = {
      user_id: userId,
    };

    const token = jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '1h' });
    return { token };
  }
}
