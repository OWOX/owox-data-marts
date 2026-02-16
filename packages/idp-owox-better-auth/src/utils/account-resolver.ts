import { logger } from '../core/logger.js';
import type { DatabaseStore } from '../store/database-store.js';
import type { DatabaseAccount } from '../types/database-models.js';
import { resolveProviderFromLoginMethod } from './auth-provider-utils.js';

/**
 * Resolves the best account for a user, preferring their last-login provider.
 * Falls back to the latest account if the preferred provider is unavailable.
 */
export async function resolveAccountForUser(
  store: DatabaseStore,
  userId: string,
  loginMethod: string | null | undefined
): Promise<DatabaseAccount | null> {
  const preferredProvider = resolveProviderFromLoginMethod(loginMethod);

  if (preferredProvider) {
    const preferredAccount = await store.getAccountByUserIdAndProvider(userId, preferredProvider);
    if (preferredAccount) {
      return preferredAccount;
    }
    logger.warn('Account for last-login provider not found, falling back to latest account', {
      userId,
      preferredProvider,
    });
  }

  return store.getAccountByUserId(userId);
}
