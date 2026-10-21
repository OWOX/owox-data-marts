import { act, cleanup, renderHook } from '@testing-library/react';
import { AxiosError, CanceledError, type AxiosAdapter, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient, { type AxiosRequestConfig } from '../../../app/api/apiClient';
import { clearTokenProvider, setTokenProvider } from '../../../app/api/token-provider';
import { LoadingProvider } from './LoadingContext';
import { useLoading } from './useLoading';

vi.mock('../../utils', () => ({ showApiErrorToast: vi.fn() }));

const unauthorized: AxiosAdapter = async config => {
  throw new AxiosError('Unauthorized', undefined, config, undefined, {
    config,
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    data: {},
  });
};

function pendingResponse() {
  let finish!: () => void;
  const ready = new Promise<void>(resolve => {
    finish = resolve;
  });
  const adapter: AxiosAdapter = async config => {
    await ready;
    return { config, status: 200, statusText: 'OK', headers: {}, data: [] };
  };
  return { adapter, finish };
}

describe('LoadingProvider with the API interceptors', () => {
  beforeEach(() => {
    clearTokenProvider();
  });

  afterEach(() => {
    cleanup();
    clearTokenProvider();
  });

  it.each(['refresh fails', 'token provider is missing', 'retry returns 401'])(
    'preserves the auth error and stops loading when %s',
    async scenario => {
      if (scenario !== 'token provider is missing') {
        setTokenProvider({
          getAccessToken: () => 'expired-token',
          refreshToken: async () => {
            if (scenario === 'refresh fails') throw new Error('Session expired');
            return 'fresh-token';
          },
        });
      }
      const { result } = renderHook(useLoading, { wrapper: LoadingProvider });
      let failure: unknown;

      await act(async () => {
        failure = await apiClient
          .get('/data-marts', { adapter: unauthorized })
          .catch((error: unknown) => error);
      });

      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty('message', 'Token refresh failed');
      expect(result.current.isLoading).toBe(false);
    }
  );

  it('does not finish a foreground request when a silent request fails to refresh its token', async () => {
    setTokenProvider({
      getAccessToken: () => 'expired-token',
      refreshToken: async () => {
        throw new Error('Session expired');
      },
    });
    const { result } = renderHook(useLoading, { wrapper: LoadingProvider });
    const foreground = pendingResponse();
    let request!: Promise<AxiosResponse>;

    await act(async () => {
      request = apiClient.get('/data-marts', { adapter: foreground.adapter });
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await apiClient
        .get('/search', {
          adapter: unauthorized,
          skipLoadingIndicator: true,
        } as AxiosRequestConfig)
        .catch(() => undefined);
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      foreground.finish();
      await request;
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('passes an error without request config through unchanged and stops loading', async () => {
    const { result } = renderHook(useLoading, { wrapper: LoadingProvider });
    const failure = new Error('Request preparation failed');
    let caught: unknown;

    await act(async () => {
      caught = await apiClient
        .get('/data-marts', {
          adapter: async () => {
            throw failure;
          },
        })
        .catch((error: unknown) => error);
    });

    expect(caught).toBe(failure);
    expect(result.current.isLoading).toBe(false);
  });

  it('preserves a request serialization error that occurs before any HTTP request', async () => {
    const { result } = renderHook(useLoading, { wrapper: LoadingProvider });
    const adapter = vi.fn<AxiosAdapter>();
    let caught: unknown;

    await act(async () => {
      caught = await apiClient
        .post('/data-marts', { value: 1n }, { adapter })
        .catch((error: unknown) => error);
    });

    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as Error).message).toMatch(/BigInt/i);
    expect(adapter).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it.each([AxiosError.ERR_NETWORK, AxiosError.ECONNABORTED, AxiosError.ERR_CANCELED])(
    'preserves a silent %s failure without finishing another request',
    async code => {
      const { result } = renderHook(useLoading, { wrapper: LoadingProvider });
      const foreground = pendingResponse();
      let request!: Promise<AxiosResponse>;
      let failure: unknown;
      let caught: unknown;

      await act(async () => {
        request = apiClient.get('/data-marts', { adapter: foreground.adapter });
      });
      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        caught = await apiClient
          .get('/search', {
            skipLoadingIndicator: true,
            adapter: async config => {
              failure =
                code === AxiosError.ERR_CANCELED
                  ? new CanceledError('Canceled', config)
                  : new AxiosError('Request failed', code, config);
              throw failure;
            },
          } as AxiosRequestConfig)
          .catch((error: unknown) => error);
      });

      expect(caught).toBe(failure);
      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        foreground.finish();
        await request;
      });
      expect(result.current.isLoading).toBe(false);
    }
  );

  it('stops loading after a successful token refresh and retried request', async () => {
    setTokenProvider({
      getAccessToken: () => 'expired-token',
      refreshToken: async () => 'fresh-token',
    });
    const { result } = renderHook(useLoading, { wrapper: LoadingProvider });
    const retried = pendingResponse();
    let attempts = 0;
    let request!: Promise<AxiosResponse>;

    await act(async () => {
      request = apiClient.get('/data-marts', {
        adapter: config => {
          attempts += 1;
          return attempts === 1 ? unauthorized(config) : retried.adapter(config);
        },
      });
    });

    expect(attempts).toBe(2);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      retried.finish();
      await request;
    });
    expect(result.current.isLoading).toBe(false);
  });
});
