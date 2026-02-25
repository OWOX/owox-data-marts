import { createServiceLogger } from '../../core/logger.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { DatabaseAccount, DatabaseUser } from '../../types/index.js';

export interface UserAccountPair {
  user: DatabaseUser;
  account: DatabaseAccount;
}

interface AccountResolutionStrategy {
  name: string;
  getProviderId: (user: DatabaseUser, preferred?: string) => string | null | undefined;
}

const PRIORITY_STRATEGIES: AccountResolutionStrategy[] = [
  { name: 'preferred', getProviderId: (_, preferred) => preferred },
  { name: 'lastLogin', getProviderId: user => user.lastLoginMethod },
  { name: 'firstLogin', getProviderId: user => user.firstLoginMethod },
];

/**
 * Normalizes provider ID by trimming and lowercasing.
 * Returns undefined for null/empty/whitespace-only values.
 */
function normalizeProviderId(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
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
  private readonly logger = createServiceLogger(UserAccountResolver.name);

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
      this.logger.debug('User not found by ID', { userId });
      return null;
    }

    const account = await this.resolveAccountForUser(user, preferredLoginMethod);
    if (!account) {
      this.logger.warn('No account found for user', { userId });
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
      this.logger.debug('User not found by email', { email });
      return null;
    }

    const account = await this.resolveAccountForUser(user, preferredLoginMethod);
    if (!account) {
      this.logger.warn('No account found for user', { userId: user.id, email });
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

    // Try each strategy in priority order
    for (const strategy of PRIORITY_STRATEGIES) {
      const providerId = normalizeProviderId(strategy.getProviderId(user, preferredLoginMethod));
      if (!providerId) continue;

      const account = await this.store.getAccountByUserIdAndProvider(userId, providerId);
      if (account) {
        this.logger.debug(`Resolved account from ${strategy.name}`, {
          userId,
          providerId,
          accountId: account.accountId,
        });
        return account;
      }
      this.logger.debug(`Account for ${strategy.name} not found, trying next priority`, {
        userId,
        providerId,
      });
    }

    // Fallback to getAccountByUserId() (latest account)
    const fallbackAccount = await this.store.getAccountByUserId(userId);
    if (fallbackAccount) {
      this.logger.debug('Resolved account from fallback (latest)', {
        userId,
        providerId: fallbackAccount.providerId,
        accountId: fallbackAccount.accountId,
      });
      return fallbackAccount;
    }

    this.logger.warn('No account found for user after all priorities exhausted', { userId });
    return null;
  }
}
