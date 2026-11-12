import { refreshMemberAccessToken } from '../../../app/api/apiClient';
import { getTokenProvider } from '../../../app/api/token-provider';

/** A token closer than this to expiry is refreshed before it is handed out. */
const REFRESH_MARGIN_MS = 60_000;
/**
 * A plugin whose API keeps answering 401 would otherwise turn every retry into a session
 * refresh. Right after a refresh, another one cannot yield a different token anyway.
 */
const FORCED_REFRESH_INTERVAL_MS = 10_000;
let lastRefreshAt = -Infinity;

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
  // A token whose expiry cannot be read (not every identity provider issues a JWT) is
  // handed out as is; the plugin asks for a fresh one when its API rejects it.
  const usable = current && (exp === null || exp - Date.now() > REFRESH_MARGIN_MS);
  const justRefreshed = Date.now() - lastRefreshAt < FORCED_REFRESH_INTERVAL_MS;
  // A just-refreshed token is served even when it reads as expiring: that is a browser
  // clock running ahead, and refreshing again would only repeat on every request.
  if (current && (justRefreshed || (usable && !fresh))) return current;

  // Stamped only once the refresh succeeds: requests arriving while it is in flight join
  // it through the shared refresh instead of getting the token being replaced.
  const token = await refreshMemberAccessToken();
  lastRefreshAt = Date.now();
  return token;
};
