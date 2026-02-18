import { Payload } from '@owox/idp-protocol';
import { AuthenticationException } from '../../core/exceptions.js';
import { logger } from '../../core/logger.js';
import { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { DatabaseAccount, DatabaseUser } from '../../types/database-models.js';
import { resolveAccountForUser } from '../../utils/account-resolver.js';
import { normalizeEmail } from '../../utils/email-utils.js';

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

    const normalized = normalizeEmail(payload.email);
    if (!normalized) {
      throw new AuthenticationException('Invalid token payload: email is malformed', {
        context: { email: payload.email },
      });
    }
    const normalizedEmail = normalized;

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

    const account = await resolveAccountForUser(this.store, user.id, user.lastLoginMethod);
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
}
