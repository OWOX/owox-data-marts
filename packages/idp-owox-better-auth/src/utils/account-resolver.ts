import { createServiceLogger } from '../core/logger.js';

const logger = createServiceLogger('AccountResolver');
import type { DatabaseStore } from '../store/database-store.js';
import type { DatabaseAccount } from '../types/index.js';

const CREDENTIAL_PROVIDER_ID = 'credential';
const CREDENTIAL_LOGIN_METHODS = new Set(['email', 'email-password']);

/**
 * @deprecated Use UserAccountResolver.resolveAccountForUser() instead.
 * This function is kept for backward compatibility but will be removed in a future version.
 *
 * Maps Better Auth login method (firstLoginMethod from DB or signinProvider from token)
 * to providerId used in account records.
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
 * @deprecated Use UserAccountResolver service instead. Import from '../services/core/user-account-resolver.js'
 * and use resolveByUserId() or resolveByEmail() methods which provide better priority logic:
 * 1. Preferred login method (parameter)
 * 2. user.lastLoginMethod
 * 3. user.firstLoginMethod
 * 4. Fallback to getAccountByUserId()
 *
 * This function is kept for backward compatibility but will be removed in a future version.
 *
 * Resolves the best account for a user, preferring the provided login method
 * (typically signinProvider from token or firstLoginMethod from DB).
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
    logger.warn('Account for preferred provider not found, falling back to latest account', {
      userId,
      preferredProvider,
    });
  }

  return store.getAccountByUserId(userId);
}
