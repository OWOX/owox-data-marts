import { Payload } from '@owox/idp-protocol';
import { AuthenticationException } from '../../core/exceptions.js';
import { createServiceLogger } from '../../core/logger.js';
import { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import type { DatabaseAccount, DatabaseUser } from '../../types/index.js';
import { maskEmail, normalizeEmail } from '../../utils/email-utils.js';
import { UserAccountResolver } from './user-account-resolver.js';

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
  private readonly logger = createServiceLogger(UserContextService.name);

  constructor(
    private readonly userAccountResolver: UserAccountResolver,
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
        context: { email: maskEmail(payload.email) },
      });
    }
    const normalizedEmail = normalized;

    // Use preferredLoginMethod from payload.signinProvider if available
    const preferredLoginMethod =
      typeof payload.signinProvider === 'string' && payload.signinProvider.length > 0
        ? payload.signinProvider
        : undefined;

    const userAccountPair = await this.userAccountResolver.resolveByEmail(
      normalizedEmail,
      preferredLoginMethod
    );

    if (!userAccountPair) {
      throw new AuthenticationException('User not found in Better Auth DB', {
        context: { email: maskEmail(normalizedEmail) },
      });
    }

    const { user, account } = userAccountPair;

    if (user.emailVerified !== true) {
      throw new AuthenticationException('User email is not verified in Better Auth DB', {
        context: {
          email: maskEmail(normalizedEmail),
          userId: user.id,
          emailVerified: user.emailVerified,
        },
      });
    }

    this.logger.info('Resolved user context from token', {
      email: maskEmail(normalizedEmail),
      userId: user.id,
      accountId: account.accountId,
    });

    return { payload, user, account };
  }
}
