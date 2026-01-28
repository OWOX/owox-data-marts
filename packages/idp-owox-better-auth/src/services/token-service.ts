import { createBetterAuthConfig } from '../auth/auth-config.js';
import { CryptoService } from './crypto-service.js';
import { Payload, AuthResult } from '@owox/idp-protocol';
import { logger } from '../logger.js';

export class TokenService {
  private static readonly DEFAULT_ORGANIZATION_ID = '0';

  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly cryptoService: CryptoService
  ) {}

  async introspectToken(token: string): Promise<Payload | null> {
    logger.info('Token introspection is disabled (no sessions issued)', {
      tokenSnippet: token.slice(0, 8),
    });
    return null;
  }

  async parseToken(token: string): Promise<Payload | null> {
    return this.introspectToken(token);
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    logger.info('Token refresh is disabled (no sessions issued)', {
      tokenSnippet: refreshToken.slice(0, 8),
    });
    throw new Error('Token refresh is disabled for this deployment');
  }

  async revokeToken(token: string): Promise<void> {
    logger.info('Token revocation skipped (sessions disabled)', {
      tokenSnippet: token.slice(0, 8),
    });
  }
}
