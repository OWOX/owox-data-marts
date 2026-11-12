import { getTokenProvider } from '../../../app/api/token-provider';

/**
 * Serves the signed-in member's own access token, valid for at least another minute.
 *
 * Handing the member token to a plugin is a deliberate exception, allowed only for BI
 * plugins; the caller must gate it. For every other plugin the warning in
 * `fetchRuntimeToken.ts` still applies.
 *
 * The token is never cached or logged here; the only state is the in-flight refresh,
 * shared by concurrent callers and cleared when it settles.
 */
const REFRESH_MARGIN_MS = 60_000;

let inFlight: Promise<string> | null = null;

const expiresAtMs = (token: string | null): number | null => {
  try {
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: unknown;
    };
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
};

export const fetchUserToken = async (fresh: boolean): Promise<string> => {
  const provider = getTokenProvider();
  if (!provider) throw new Error('No active session');

  const current = provider.getAccessToken();
  const exp = expiresAtMs(current);
  if (!fresh && current && exp !== null && exp - Date.now() > REFRESH_MARGIN_MS) return current;

  inFlight ??= provider.refreshToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
};
