import { Payload } from '@owox/idp-protocol';
import { AuthenticationException } from '../../core/exceptions.js';
import { logger } from '../../core/logger.js';
import { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { DatabaseAccount, DatabaseUser } from '../../types/database-models.js';
import { resolveProviderFromLoginMethod } from '../../utils/auth-provider-utils.js';

export interface UserContext {
  payload: Payload;
  user: DatabaseUser;
  account: DatabaseAccount;
}

/**
 * Responsible for resolving Better Auth user/account from any JWT token
 * (access or refresh) that contains an email claim.
 */
export class UserContextService {
  constructor(
    private readonly store: DatabaseStore,
    private readonly tokenFacade: OwoxTokenFacade
  ) {}

  async resolveFromToken(token: string): Promise<UserContext> {
    const payload = await this.tokenFacade.parseToken(token);

    if (!payload || !payload.email) {
      throw new AuthenticationException('Invalid token payload: email is missing');
    }

    const normalizedEmail = this.normalizeEmail(payload.email);
    if (!normalizedEmail) {
      throw new AuthenticationException('Invalid token payload: email is malformed', {
        context: { email: payload.email },
      });
    }

    const user = await this.store.getUserByEmail(normalizedEmail);
    if (!user) {
      throw new AuthenticationException('User not found in Better Auth DB', {
        context: { email: normalizedEmail },
      });
    }

    if (user.emailVerified !== true) {
      throw new AuthenticationException('User email is not verified in Better Auth DB', {
        context: { email: normalizedEmail, userId: user.id, emailVerified: user.emailVerified },
      });
    }

    const account = await this.resolveAccountForUser(user, normalizedEmail);
    if (!account) {
      throw new AuthenticationException('Account not found for user', {
        context: { userId: user.id, email: normalizedEmail },
      });
    }

    logger.info('Resolved user context from token', {
      email: normalizedEmail,
      userId: user.id,
      accountId: account.accountId,
    });

    return { payload, user, account };
  }

  private normalizeEmail(email: string): string | null {
    const normalized = email.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private async resolveAccountForUser(
    user: DatabaseUser,
    normalizedEmail: string
  ): Promise<DatabaseAccount | null> {
    const preferredProvider = resolveProviderFromLoginMethod(user.lastLoginMethod);
    if (preferredProvider) {
      const preferredAccount = await this.store.getAccountByUserIdAndProvider(
        user.id,
        preferredProvider
      );

      if (preferredAccount) {
        return preferredAccount;
      }

      logger.error(
        'Account for last-login provider not found in refresh flow, falling back to latest account',
        {
          userId: user.id,
          email: normalizedEmail,
          preferredProvider,
        }
      );
    }
    return this.store.getAccountByUserId(user.id);
  }
}
