import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshMemberAccessToken } from '../../../app/api/apiClient';
import { clearTokenProvider, setTokenProvider } from '../../../app/api/token-provider';
import { fetchUserToken } from './fetchUserToken';

const jwt = (exp: number) =>
  `${btoa('{"alg":"none"}')}.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.`;
// Each test starts an hour after the previous one: the module remembers when it last
// refreshed, and a test must not inherit that from its neighbour.
let now = Date.UTC(2026, 0, 1);
const inSeconds = (s: number) => Math.floor(now / 1000) + s;

describe('fetchUserToken', () => {
  const refreshToken = vi.fn<() => Promise<string>>();
  const useToken = (token: string | null) => {
    setTokenProvider({ getAccessToken: () => token, refreshToken });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    now += 3_600_000;
    vi.setSystemTime(now);
    refreshToken.mockReset().mockResolvedValue('refreshed');
  });
  afterEach(() => {
    vi.useRealTimers();
    clearTokenProvider();
  });

  it('returns the current token while it has more than a minute left', async () => {
    const token = jwt(inSeconds(300));
    useToken(token);
    await expect(fetchUserToken(false)).resolves.toBe(token);
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('refreshes a token that expires within a minute', async () => {
    useToken(jwt(inSeconds(30)));
    await expect(fetchUserToken(false)).resolves.toBe('refreshed');
  });

  it.each([
    ['an expired token', () => jwt(inSeconds(-10))],
    ['no token', () => null],
  ])('refreshes when there is %s', async (_label, token) => {
    useToken(token());
    await expect(fetchUserToken(false)).resolves.toBe('refreshed');
  });

  it('hands out a token with no readable expiry and refreshes it only on request', async () => {
    useToken('opaque-token');
    await expect(fetchUserToken(false)).resolves.toBe('opaque-token');
    expect(refreshToken).not.toHaveBeenCalled();
    await expect(fetchUserToken(true)).resolves.toBe('refreshed');
  });

  it('gives every concurrent fresh request the refreshed token, not the one being replaced', async () => {
    useToken(jwt(inSeconds(300)));
    const results = await Promise.all([fetchUserToken(true), fetchUserToken(true)]);
    expect(results).toEqual(['refreshed', 'refreshed']);
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it('does not hold back a fresh request after a failed refresh', async () => {
    useToken(jwt(inSeconds(300)));
    refreshToken.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchUserToken(true)).rejects.toThrow('offline');
    await expect(fetchUserToken(true)).resolves.toBe('refreshed');
  });

  it('does not refresh on request right after an expiry-driven refresh', async () => {
    const token = jwt(inSeconds(300));
    useToken(null);
    await fetchUserToken(false);
    useToken(token);
    await expect(fetchUserToken(true)).resolves.toBe(token);
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes when asked for a fresh token', async () => {
    useToken(jwt(inSeconds(300)));
    await expect(fetchUserToken(true)).resolves.toBe('refreshed');
  });

  it('does not refresh again when a fresh token is asked for right after a forced refresh', async () => {
    const token = jwt(inSeconds(300));
    useToken(token);
    await fetchUserToken(true);
    await expect(fetchUserToken(true)).resolves.toBe(token);
    expect(refreshToken).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    await expect(fetchUserToken(true)).resolves.toBe('refreshed');
    expect(refreshToken).toHaveBeenCalledTimes(2);
  });

  it('shares one refresh between concurrent requests', async () => {
    useToken(null);
    const results = await Promise.all([
      fetchUserToken(false),
      fetchUserToken(true),
      fetchUserToken(false),
    ]);
    expect(results).toEqual(['refreshed', 'refreshed', 'refreshed']);
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it('joins a refresh the host already started instead of starting another', async () => {
    useToken(null);
    const hostRefresh = refreshMemberAccessToken();
    await expect(fetchUserToken(true)).resolves.toBe('refreshed');
    await expect(hostRefresh).resolves.toBe('refreshed');
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it('fails when no session is available', async () => {
    clearTokenProvider();
    await expect(fetchUserToken(false)).rejects.toThrow();
  });

  it('clears the shared refresh after a failure', async () => {
    useToken(null);
    refreshToken.mockRejectedValueOnce(new Error('boom'));
    await expect(fetchUserToken(false)).rejects.toThrow('boom');
    await expect(fetchUserToken(false)).resolves.toBe('refreshed');
  });
});
