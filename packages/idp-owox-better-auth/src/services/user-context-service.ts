import { Payload } from '@owox/idp-protocol';
import { Logger } from '@owox/internal-helpers';
import { AuthenticationException } from '../exception.js';
import { OwoxTokenFacade } from '../facades/owox-token-facade.js';
import type { DatabaseStore } from '../store/DatabaseStore.js';
import type { DatabaseAccount, DatabaseUser } from '../types/database-models.js';

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
    private readonly tokenFacade: OwoxTokenFacade,
    private readonly logger?: Logger
  ) {}

  async resolveFromToken(token: string): Promise<UserContext> {
    const payload = await this.tokenFacade.parseToken(token);

    if (!payload || !payload.email) {
      throw new AuthenticationException('Invalid token payload: email is missing');
    }

    const user = await this.store.getUserByEmail(payload.email);
    if (!user) {
      throw new AuthenticationException('User not found in Better Auth DB', {
        context: { email: payload.email },
      });
    }

    const account = await this.store.getAccountByUserId(user.id);
    if (!account) {
      throw new AuthenticationException('Account not found for user', {
        context: { userId: user.id, email: payload.email },
      });
    }

    this.logger?.debug?.('Resolved user context from token', {
      email: payload.email,
      userId: user.id,
      accountId: account.accountId,
    });

    return { payload, user, account };
  }
}
