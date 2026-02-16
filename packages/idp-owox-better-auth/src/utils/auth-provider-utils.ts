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
