import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class InternalApiGuard implements CanActivate {
  private readonly logger = new Logger(InternalApiGuard.name);
  private readonly client = new OAuth2Client();
  private readonly expectedAudience: string | undefined;
  private readonly expectedSigningAccount: string | undefined;
  private readonly isConfigured: boolean;

  constructor(private configService: ConfigService) {
    this.expectedAudience = this.configService.get<string>('INTERNAL_API_AUDIENCE');
    this.expectedSigningAccount = this.configService.get<string>(
      'INTERNAL_API_AUTH_SERVICE_ACCOUNT'
    );
    this.isConfigured = !!this.expectedAudience && !!this.expectedSigningAccount;
    this.logger.log(`Internal API guard is ${this.isConfigured ? '' : 'not '}configured`);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.error('Internal API guard is not configured');
      throw new UnauthorizedException();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.error(`Wrong Authorization header: ${authHeader}`);
      throw new UnauthorizedException();
    }

    const idToken = authHeader.substring(7);

    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: this.expectedAudience,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      this.logger.error('Token payload is empty');
      throw new UnauthorizedException();
    }

    const isEmailVerified = payload.email_verified === true;
    const isCorrectAccount = payload.email === this.expectedSigningAccount;

    if (!isEmailVerified || !isCorrectAccount) {
      this.logger.warn(
        `Token can't be verified. Verified: ${isEmailVerified}, Email: ${payload.email}`
      );
      throw new UnauthorizedException();
    }

    return true;
  }
}
