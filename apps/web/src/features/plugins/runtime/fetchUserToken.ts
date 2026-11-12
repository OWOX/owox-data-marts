import { refreshAccessToken } from '../../../app/api/apiClient';
import { getTokenProvider } from '../../../app/api/token-provider';

/** A token closer than this to expiry is refreshed before it is handed out. */
const REFRESH_MARGIN_MS = 60_000;
/**
 * A plugin whose API keeps answering 401 would otherwise turn every retry into a session
 * refresh. A second forced refresh this soon cannot yield a different token anyway.
 */
const FORCED_REFRESH_INTERVAL_MS = 10_000;
let lastForcedRefreshAt = -Infinity;

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

/**
 * Serves the signed-in member's own access token, valid for at least another minute.
 *
 * Handing the member token to a plugin is a deliberate exception, allowed only for BI
 * plugins; the caller must gate it. For every other plugin the warning in
 * `fetchRuntimeToken.ts` still applies.
 *
 * The token is never cached or logged here. A refresh goes through the app's shared
 * refresh, so concurrent plugin requests and the app's own 401 handling run only one.
 */
export const fetchUserToken = async (fresh: boolean): Promise<string> => {
  const provider = getTokenProvider();
  if (!provider) throw new Error('No active session');

  const current = provider.getAccessToken();
  const exp = expiresAtMs(current);
  const usable = current && exp !== null && exp - Date.now() > REFRESH_MARGIN_MS;
  const forced = fresh && Date.now() - lastForcedRefreshAt >= FORCED_REFRESH_INTERVAL_MS;
  if (usable && !forced) return current;

  if (forced) lastForcedRefreshAt = Date.now();
  return refreshAccessToken();
};
