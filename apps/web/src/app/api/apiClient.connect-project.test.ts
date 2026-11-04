import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  token: 'token-a',
  projectId: 'project-a',
  userId: 'user-a',
  refresh: vi.fn(),
}));
vi.mock('../../shared/utils', () => ({ showApiErrorToast: vi.fn() }));
vi.mock('./token-provider', () => ({
  getTokenProvider: () => ({
    getAccessToken: () => mocks.token,
    getProjectId: () => mocks.projectId,
    getUserId: () => mocks.userId,
    refreshToken: mocks.refresh,
  }),
}));
vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>();
  const instance = Object.assign(vi.fn(), {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  });
  return { ...actual, default: { create: vi.fn().mockReturnValue(instance) } };
});

interface Request {
  url: string;
  method: string;
  headers: Record<string, string>;
}
type Client = ReturnType<typeof vi.fn> & {
  interceptors: {
    request: { use: ReturnType<typeof vi.fn> };
    response: { use: ReturnType<typeof vi.fn> };
  };
};

async function load() {
  const axios = await import('axios');
  await import('./apiClient');
  const client = vi.mocked(axios.default.create).mock.results[0].value as Client;
  return {
    client,
    send: client.interceptors.request.use.mock.calls[0][0] as (
      request: Request
    ) => Promise<Request> | Request,
    reject: client.interceptors.response.use.mock.calls[0][1] as (
      error: unknown
    ) => Promise<unknown>,
  };
}

const target = '/ui/project-a/connect/credentials/setup-1?source=chat#form';
const logout = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  window.history.replaceState({}, '', target);
  window.addEventListener('auth:logout', logout);
  mocks.token = 'token-a';
  mocks.projectId = 'project-a';
  mocks.userId = 'user-a';
});
afterEach(() => {
  window.removeEventListener('auth:logout', logout);
  window.history.replaceState({}, '', '/');
});

describe('apiClient connect project', () => {
  it.each(['/credentials', '/connectors/FacebookMarketing/oauth/exchange'])(
    'does not replay %s as another user in the same project',
    async url => {
      const { client, send, reject } = await load();
      const request = await send({ url, method: 'post', headers: {} });
      mocks.refresh.mockImplementation(async () => {
        mocks.token = 'token-b';
        mocks.userId = 'user-b';
        return 'token-b';
      });

      await expect(reject({ response: { status: 401 }, config: request })).rejects.toThrow();

      expect(client).not.toHaveBeenCalled();
      expect((logout.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
        reason: 'connect_account_changed',
        connectTarget: target,
      });
    }
  );

  it('checks each user after a shared token refresh', async () => {
    const { send, reject, client } = await load();
    const requestA = await send({ url: '/credentials', method: 'post', headers: {} });
    mocks.userId = 'user-b';
    mocks.token = 'old-token-b';
    const requestB = await send({ url: '/credentials', method: 'post', headers: {} });
    let finishRefresh: ((token: string) => void) | undefined;
    mocks.refresh.mockImplementation(
      () =>
        new Promise(resolve => {
          finishRefresh = resolve;
        })
    );
    client.mockResolvedValue({ status: 200 });
    const replayB = reject({ response: { status: 401 }, config: requestB });
    const refusedA = expect(
      reject({ response: { status: 401 }, config: requestA })
    ).rejects.toThrow();
    mocks.token = 'token-b';
    finishRefresh?.('token-b');

    await expect(replayB).resolves.toEqual({ status: 200 });
    await refusedA;
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(client).toHaveBeenCalledTimes(1);
    expect((logout.mock.calls[0][0] as CustomEvent).detail.reason).toBe('connect_account_changed');
  });

  it.each(['/credentials', '/connectors/FacebookMarketing/oauth/exchange'])(
    'does not replay %s with a token from another project',
    async url => {
      const { client, send, reject } = await load();
      const request = await send({ url, method: 'post', headers: {} });
      window.history.replaceState({}, '', '/ui/project-b/data-marts');
      mocks.refresh.mockImplementation(async () => {
        mocks.token = 'token-b';
        mocks.projectId = 'project-b';
        return 'token-b';
      });

      await expect(reject({ response: { status: 401 }, config: request })).rejects.toThrow();

      expect(client).not.toHaveBeenCalled();
      expect(logout).not.toHaveBeenCalled();
    }
  );

  it('refuses the first send when the active token belongs to another project', async () => {
    const { send } = await load();
    mocks.projectId = 'project-b';
    mocks.token = 'token-b';

    await expect(
      Promise.resolve().then(() => send({ url: '/credentials', method: 'post', headers: {} }))
    ).rejects.toThrow();
    expect(logout).toHaveBeenCalledTimes(1);
    expect((logout.mock.calls[0][0] as CustomEvent).detail).toEqual({
      reason: 'connect_project_mismatch',
      connectTarget: target,
    });
  });

  it.each(['mismatch', 'refresh failure'])(
    'uses the current setup target after navigation and a %s',
    async failure => {
      const { send, reject } = await load();
      const request = await send({ url: '/credentials', method: 'post', headers: {} });
      window.history.replaceState({}, '', '/ui/project-b/connect/credentials/setup-2');
      const { ConnectProjectMismatchError } =
        await import('../../features/idp/utils/connect-project');
      mocks.refresh.mockRejectedValue(
        failure === 'mismatch'
          ? new ConnectProjectMismatchError({
              projectId: 'project-b',
              url: '/ui/project-b/connect/credentials/setup-2',
            })
          : new Error('The session expired')
      );

      await expect(reject({ response: { status: 401 }, config: request })).rejects.toThrow();

      expect((logout.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
        connectTarget: '/ui/project-b/connect/credentials/setup-2',
      });
    }
  );

  it('checks each project after a shared token refresh', async () => {
    const { send, reject, client } = await load();
    const requestA = await send({ url: '/credentials', method: 'post', headers: {} });
    window.history.replaceState({}, '', '/ui/project-b/connect/credentials/setup-2');
    mocks.projectId = 'project-b';
    mocks.token = 'old-token-b';
    const requestB = await send({ url: '/credentials', method: 'post', headers: {} });
    let finishRefresh: ((token: string) => void) | undefined;
    mocks.refresh.mockImplementation(
      () =>
        new Promise(resolve => {
          finishRefresh = resolve;
        })
    );
    client.mockResolvedValue({ status: 200 });
    const replayB = reject({ response: { status: 401 }, config: requestB });
    const replayA = reject({ response: { status: 401 }, config: requestA });
    const refusedA = expect(replayA).rejects.toThrow();
    mocks.token = 'token-b';
    finishRefresh?.('token-b');

    await expect(replayB).resolves.toEqual({ status: 200 });
    await refusedA;
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(client).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();
  });
});
