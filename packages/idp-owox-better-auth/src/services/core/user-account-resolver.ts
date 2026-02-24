import { createServiceLogger } from '../../core/logger.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { DatabaseAccount, DatabaseUser } from '../../types/index.js';

const logger = createServiceLogger('UserAccountResolver');

const CREDENTIAL_PROVIDER_ID = 'credential';
const CREDENTIAL_LOGIN_METHODS = new Set(['email', 'email-password']);

export interface UserAccountPair {
  user: DatabaseUser;
  account: DatabaseAccount;
}

/**
 * Maps Better Auth login method (firstLoginMethod from DB or signinProvider from token)
 * to providerId used in account records.
 */
function resolveProviderFromLoginMethod(
  loginMethod: string | null | undefined
): string | undefined {
  if (!loginMethod) return undefined;
  const normalized = loginMethod.trim().toLowerCase();
  if (!normalized) return undefined;
  if (CREDENTIAL_LOGIN_METHODS.has(normalized)) return CREDENTIAL_PROVIDER_ID;
  return normalized;
}

/**
 * Resolves user and account together with smart fallback logic for account selection.
 * Priority for account selection:
 * 1. Preferred login method (parameter)
 * 2. user.lastLoginMethod
 * 3. user.firstLoginMethod
 * 4. Fallback to getAccountByUserId() (latest account)
 */
export class UserAccountResolver {
  constructor(private readonly store: DatabaseStore) {}

  /**
   * Resolves user and account by user ID.
   * Returns null if user not found or no account exists.
   */
  async resolveByUserId(
    userId: string,
    preferredLoginMethod?: string
  ): Promise<UserAccountPair | null> {
    const user = await this.store.getUserById(userId);
    if (!user) {
      logger.debug('User not found by ID', { userId });
      return null;
    }

    const account = await this.resolveAccountForUser(user, preferredLoginMethod);
    if (!account) {
      logger.warn('No account found for user', { userId });
      return null;
    }

    return { user, account };
  }

  /**
   * Resolves user and account by email.
   * Returns null if user not found or no account exists.
   */
  async resolveByEmail(
    email: string,
    preferredLoginMethod?: string
  ): Promise<UserAccountPair | null> {
    const user = await this.store.getUserByEmail(email);
    if (!user) {
      logger.debug('User not found by email', { email });
      return null;
    }

    const account = await this.resolveAccountForUser(user, preferredLoginMethod);
    if (!account) {
      logger.warn('No account found for user', { userId: user.id, email });
      return null;
    }

    return { user, account };
  }

  /**
   * Resolves the best account for a user with priority:
   * 1. preferredLoginMethod parameter
   * 2. user.lastLoginMethod from DB
   * 3. user.firstLoginMethod from DB
   * 4. Fallback to getAccountByUserId() (latest account)
   *
   * Falls back to the latest account if the preferred provider is unavailable.
   */
  private async resolveAccountForUser(
    user: DatabaseUser,
    preferredLoginMethod?: string
  ): Promise<DatabaseAccount | null> {
    const userId = user.id;

    // Priority 1: Try preferredLoginMethod from parameter
    if (preferredLoginMethod) {
      const preferredProvider = resolveProviderFromLoginMethod(preferredLoginMethod);
      if (preferredProvider) {
        const account = await this.store.getAccountByUserIdAndProvider(userId, preferredProvider);
        if (account) {
          logger.debug('Resolved account from preferredLoginMethod', {
            userId,
            preferredProvider,
            accountId: account.accountId,
          });
          return account;
        }
        logger.debug('Account for preferredLoginMethod not found, trying next priority', {
          userId,
          preferredProvider,
        });
      }
    }

    // Priority 2: Try user.lastLoginMethod from DB
    if (user.lastLoginMethod) {
      const lastLoginProvider = resolveProviderFromLoginMethod(user.lastLoginMethod);
      if (lastLoginProvider) {
        const account = await this.store.getAccountByUserIdAndProvider(userId, lastLoginProvider);
        if (account) {
          logger.debug('Resolved account from lastLoginMethod', {
            userId,
            lastLoginProvider,
            accountId: account.accountId,
          });
          return account;
        }
        logger.debug('Account for lastLoginMethod not found, trying next priority', {
          userId,
          lastLoginProvider,
        });
      }
    }

    // Priority 3: Try user.firstLoginMethod from DB
    if (user.firstLoginMethod) {
      const firstLoginProvider = resolveProviderFromLoginMethod(user.firstLoginMethod);
      if (firstLoginProvider) {
        const account = await this.store.getAccountByUserIdAndProvider(userId, firstLoginProvider);
        if (account) {
          logger.debug('Resolved account from firstLoginMethod', {
            userId,
            firstLoginProvider,
            accountId: account.accountId,
          });
          return account;
        }
        logger.debug('Account for firstLoginMethod not found, falling back to latest', {
          userId,
          firstLoginProvider,
        });
      }
    }

    // Priority 4: Fallback to getAccountByUserId() (latest account)
    const fallbackAccount = await this.store.getAccountByUserId(userId);
    if (fallbackAccount) {
      logger.debug('Resolved account from fallback (latest)', {
        userId,
        providerId: fallbackAccount.providerId,
        accountId: fallbackAccount.accountId,
      });
      return fallbackAccount;
    }

    logger.warn('No account found for user after all priorities exhausted', { userId });
    return null;
  }
}
