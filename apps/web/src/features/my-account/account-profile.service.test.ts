import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../app/api/apiClient';
import { showApiErrorToast } from '../../shared/utils';
import {
  getAccountEmailPreferences,
  getAccountProfile,
  updateAccountEmailPreference,
  updateAccountProfile,
  updateErasureRequest,
} from './account-profile.service';

const provider = vi.hoisted(() => ({
  token: 'expired-token',
  userId: 'user-1',
  projectId: 'project-1',
  refresh: vi.fn(),
}));
vi.mock('../../shared/utils', () => ({ showApiErrorToast: vi.fn() }));
vi.mock('../idp/services/auth-api.service', () => ({ isBlockedUserError: () => false }));
vi.mock('../../app/api/token-provider', () => ({
  getTokenProvider: () => ({
    getAccessToken: () => provider.token,
    getUserId: () => provider.userId,
    getProjectId: () => provider.projectId,
    refreshToken: provider.refresh,
  }),
}));

const origin = 'https://ib.example.test';
const session = { userId: 'user-1', projectId: 'project-1' };
const profile = {
  fullName: 'Anna',
  email: 'anna@example.test',
  workEmail: '',
  phone: '',
  companyName: '',
  companyWebsite: '',
  erasureRequest: null,
};
const originalAdapter = apiClient.defaults.adapter;
const adapter = vi.fn<AxiosAdapter>();
const logout = vi.fn();

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: String(status), headers: {} };
}

function fail(config: InternalAxiosRequestConfig, status: number): never {
  throw new AxiosError(
    'Request rejected',
    'ERR_BAD_REQUEST',
    config,
    undefined,
    response(config, {}, status)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  adapter.mockReset();
  provider.token = 'expired-token';
  provider.userId = session.userId;
  provider.projectId = session.projectId;
  provider.refresh.mockReset().mockImplementation(async () => {
    provider.token = 'fresh-token';
    return provider.token;
  });
  apiClient.defaults.adapter = adapter;
  window.history.replaceState({}, '', '/ui/me/profile');
  window.addEventListener('auth:logout', logout);
});

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  window.removeEventListener('auth:logout', logout);
  window.history.replaceState({}, '', '/');
});

describe('account requests through the shared API client', () => {
  it.each([
    {
      name: 'profile read',
      run: () => getAccountProfile(origin, session, new AbortController().signal),
      data: profile,
      method: 'get',
      path: '/api/account/me',
    },
    {
      name: 'profile update',
      run: () => updateAccountProfile(origin, session, { fullName: 'Anna' }),
      data: profile,
      method: 'patch',
      path: '/api/account/me',
    },
    {
      name: 'email preferences read',
      run: () => getAccountEmailPreferences(origin, session, new AbortController().signal),
      data: { topics: [{ id: 'Offers', subscribed: true }] },
      method: 'get',
      path: '/api/account/me/email-preferences',
    },
    {
      name: 'email preference update',
      run: () => updateAccountEmailPreference(origin, session, { id: 'Offers', subscribed: false }),
      data: undefined,
      method: 'patch',
      path: '/api/account/me/email-preferences/Offers',
    },
    {
      name: 'erasure request',
      run: () => updateErasureRequest(origin, session),
      data: undefined,
      method: 'post',
      path: '/api/account/me/erasure-request',
    },
    {
      name: 'erasure cancellation',
      run: () => updateErasureRequest(origin, session, 'request-1'),
      data: undefined,
      method: 'delete',
      path: '/api/account/me/erasure-request/request-1',
    },
  ])('refreshes an expired token and retries the $name', async ({ run, data, method, path }) => {
    const headers: unknown[] = [];
    adapter.mockImplementation(async config => {
      headers.push(config.headers.get('X-OWOX-Authorization'));
      if (headers.length === 1) return fail(config, 401);
      return response(config, data);
    });

    await run();

    expect(headers).toEqual(['Bearer expired-token', 'Bearer fresh-token']);
    expect(provider.refresh).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(adapter.mock.calls[1][0]).toMatchObject({
      baseURL: origin,
      url: path,
      method,
      withCredentials: false,
      expectedSession: session,
      skipErrorToast: true,
      skipLogoutOnUnauthorizedRetry: true,
    });
    expect(showApiErrorToast).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('uses the latest provider token instead of a token captured by the page', async () => {
    provider.token = 'already-refreshed';
    adapter.mockImplementation(async config => response(config, profile));

    expect(await getAccountProfile(origin, session, new AbortController().signal)).toEqual(profile);
    expect(adapter.mock.calls[0][0].headers.get('X-OWOX-Authorization')).toBe(
      'Bearer already-refreshed'
    );
    expect(provider.refresh).not.toHaveBeenCalled();
  });

  it.each(['userId', 'projectId'] as const)('rejects a changed %s before sending', async key => {
    provider[key] = 'other-session';

    await expect(getAccountProfile(origin, session, new AbortController().signal)).rejects.toThrow(
      'The active project or account changed'
    );

    expect(adapter).not.toHaveBeenCalled();
    expect(provider.refresh).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it.each(['userId', 'projectId'] as const)(
    'does not replay an account mutation if %s changes during refresh',
    async key => {
      adapter.mockImplementation(async config => fail(config, 401));
      provider.refresh.mockImplementation(async () => {
        provider[key] = 'other-session';
        provider.token = 'replacement-session-token';
        return provider.token;
      });

      await expect(updateAccountProfile(origin, session, { fullName: 'Updated' })).rejects.toThrow(
        'The active project or account changed'
      );

      expect(adapter).toHaveBeenCalledTimes(1);
      expect(logout).not.toHaveBeenCalled();
    }
  );

  it('keeps the App session when IB also rejects the refreshed token', async () => {
    adapter.mockImplementation(async config => fail(config, 401));

    await expect(
      getAccountProfile(origin, session, new AbortController().signal)
    ).rejects.toMatchObject({ response: { status: 401 } });

    expect(provider.refresh).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(logout).not.toHaveBeenCalled();
    expect(showApiErrorToast).not.toHaveBeenCalled();
  });

  it('lets the account page handle forbidden responses without a persistent global toast', async () => {
    adapter.mockImplementation(async config => fail(config, 403));

    await expect(
      updateAccountProfile(origin, session, { fullName: 'Updated' })
    ).rejects.toMatchObject({ response: { status: 403 } });

    expect(showApiErrorToast).not.toHaveBeenCalled();
    expect(provider.refresh).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('preserves cancellation when a profile page is unmounted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(getAccountProfile(origin, session, controller.signal)).rejects.toMatchObject({
      code: 'ERR_CANCELED',
    });

    expect(adapter).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });
});
