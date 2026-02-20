import { createServiceLogger } from '../core/logger.js';

const logger = createServiceLogger('AccountResolver');
import type { DatabaseStore } from '../store/database-store.js';
import type { DatabaseAccount } from '../types/index.js';

const CREDENTIAL_PROVIDER_ID = 'credential';
const CREDENTIAL_LOGIN_METHODS = new Set(['email', 'email-password']);

/**
 * Maps Better Auth last-login method to providerId used in account records.
 */
export function resolveProviderFromLoginMethod(
  loginMethod: string | null | undefined
): string | undefined {
  if (!loginMethod) return undefined;
  const normalized = loginMethod.trim().toLowerCase();
  if (!normalized) return undefined;
  if (CREDENTIAL_LOGIN_METHODS.has(normalized)) return CREDENTIAL_PROVIDER_ID;
  return normalized;
}

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
