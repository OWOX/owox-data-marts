import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/utils', () => ({ showApiErrorToast: vi.fn() }));

const refreshToken = vi.hoisted(() => vi.fn());

vi.mock('./token-provider', () => ({
  getTokenProvider: () => ({ getAccessToken: () => 'expired-token', refreshToken }),
}));

// The instance must be callable: the interceptor retries the original request through it.
vi.mock('axios', () => {
  const instance = Object.assign(vi.fn(), {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  });
  return {
    __esModule: true,
    default: { create: vi.fn().mockReturnValue(instance) },
    AxiosHeaders: vi.fn(),
  };
});

type Retry = ReturnType<typeof vi.fn> & {
  interceptors: { response: { use: ReturnType<typeof vi.fn> } };
};

async function load() {
  const axios = await import('axios');
  await import('./apiClient');
  const instance = (axios.default.create as unknown as ReturnType<typeof vi.fn>).mock.results[0]
    .value as Retry;
  const onRejected = instance.interceptors.response.use.mock.calls[0][1] as (
    e: unknown
  ) => Promise<unknown>;
  return { retry: instance, onRejected };
}

const expired = () => ({ response: { status: 401 }, config: { headers: {} } });

describe('apiClient — token refresh', () => {
  const onLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    window.addEventListener('auth:logout', onLogout);
  });

  afterEach(() => {
    window.removeEventListener('auth:logout', onLogout);
  });

  // The retry used to run inside the refresh's try, so a validation error on it signed the user
  // out — and the form lost the field errors it would have highlighted.
  it('passes a rejected retry on unchanged and keeps the user signed in', async () => {
    refreshToken.mockResolvedValue('fresh-token');
    const { retry, onRejected } = await load();
    const rejectedSave = { response: { status: 400, data: { message: 'Invalid config' } } };
    retry.mockRejectedValue(rejectedSave);

    await expect(onRejected(expired())).rejects.toBe(rejectedSave);

    expect(onLogout).not.toHaveBeenCalled();
  });

  it('returns the retried response after a refresh', async () => {
    refreshToken.mockResolvedValue('fresh-token');
    const { retry, onRejected } = await load();
    retry.mockResolvedValue({ status: 200, data: 'ok' });

    await expect(onRejected(expired())).resolves.toEqual({ status: 200, data: 'ok' });
    const [request] = retry.mock.calls[0] as [{ headers: Record<string, string> }];
    expect(request.headers['X-OWOX-Authorization']).toBe('Bearer fresh-token');
  });

  it('signs the user out when the refresh fails', async () => {
    refreshToken.mockRejectedValue(new Error('refresh token expired'));
    const { retry, onRejected } = await load();

    await expect(onRejected(expired())).rejects.toThrow('Token refresh failed');

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it('signs the user out when the fresh token is refused too', async () => {
    refreshToken.mockResolvedValue('fresh-token');
    const { retry, onRejected } = await load();
    retry.mockRejectedValue({ response: { status: 401 } });

    await expect(onRejected(expired())).rejects.toThrow('Token refresh failed');

    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
