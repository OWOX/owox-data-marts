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

describe('LoadingProvider with the API client', () => {
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

  it.each(['serialization', 'adapter', 'auth header'])(
    'keeps a foreground request loading when a silent %s failure has no request config',
    async scenario => {
      const { result } = renderHook(useLoading, { wrapper: LoadingProvider });
      const foreground = pendingResponse();
      const failure: Error = Object.freeze(new Error('Request preparation failed'));
      let request!: Promise<AxiosResponse>;
      let caught: unknown;

      await act(async () => {
        request = apiClient.get('/data-marts', { adapter: foreground.adapter });
      });
      expect(result.current.isLoading).toBe(true);

      try {
        if (scenario === 'auth header') {
          setTokenProvider({
            getAccessToken: () => {
              throw failure;
            },
            refreshToken: async () => 'unused-token',
          });
        }
        await act(async () => {
          caught = await apiClient
            .post('/search', scenario === 'serialization' ? { value: 1n } : {}, {
              skipLoadingIndicator: true,
              adapter: async () => {
                throw failure;
              },
            } as AxiosRequestConfig)
            .catch((error: unknown) => error);
        });

        if (scenario === 'serialization') {
          expect(caught).toBeInstanceOf(TypeError);
          expect((caught as Error).message).toMatch(/BigInt/i);
        } else {
          expect(caught).toBe(failure);
        }
        expect(caught).not.toHaveProperty('config');
        expect(result.current.isLoading).toBe(true);
      } finally {
        await act(async () => {
          foreground.finish();
          await request;
        });
      }

      expect(result.current.isLoading).toBe(false);
    }
  );

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

  const calls: [string, (config: AxiosRequestConfig) => Promise<AxiosResponse>][] = [
    ['client(config)', config => apiClient({ ...config, url: '/data-marts' })],
    ['client(url, config)', config => apiClient('/data-marts', config)],
    ['request(config)', config => apiClient.request({ ...config, url: '/data-marts' })],
    ['get', config => apiClient.get('/data-marts', config)],
    ['delete', config => apiClient.delete('/data-marts', config)],
    ['head', config => apiClient.head('/data-marts', config)],
    ['options', config => apiClient.options('/data-marts', config)],
    ['post', config => apiClient.post('/data-marts', {}, config)],
    ['put', config => apiClient.put('/data-marts', {}, config)],
    ['patch', config => apiClient.patch('/data-marts', {}, config)],
    ['query', config => apiClient.query('/data-marts', {}, config)],
    ['postForm', config => apiClient.postForm('/data-marts', {}, config)],
    ['putForm', config => apiClient.putForm('/data-marts', {}, config)],
    ['patchForm', config => apiClient.patchForm('/data-marts', {}, config)],
  ];

  it.each(calls)('tracks only foreground requests through %s', async (_name, send) => {
    const { result } = renderHook(useLoading, { wrapper: LoadingProvider });

    for (const skipLoadingIndicator of [false, true]) {
      const pending = pendingResponse();
      let request!: Promise<AxiosResponse>;

      await act(async () => {
        request = send({ adapter: pending.adapter, skipLoadingIndicator });
      });
      try {
        expect(result.current.isLoading).toBe(!skipLoadingIndicator);
      } finally {
        await act(async () => {
          pending.finish();
          await request;
        });
      }
      expect(result.current.isLoading).toBe(false);
    }
  });

  it('stays loading until every foreground request finishes', async () => {
    const { result } = renderHook(useLoading, { wrapper: LoadingProvider });
    const first = pendingResponse();
    const second = pendingResponse();
    let firstRequest!: Promise<AxiosResponse>;
    let secondRequest!: Promise<AxiosResponse>;

    await act(async () => {
      firstRequest = apiClient.get('/data-marts', { adapter: first.adapter });
      secondRequest = apiClient.get('/data-storages', { adapter: second.adapter });
    });

    try {
      expect(result.current.isLoading).toBe(true);
      await act(async () => {
        first.finish();
        await firstRequest;
      });
      expect(result.current.isLoading).toBe(true);
    } finally {
      await act(async () => {
        first.finish();
        second.finish();
        await Promise.all([firstRequest, secondRequest]);
      });
    }
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps tracking an in-flight request when the loading provider remounts', async () => {
    const mounted = renderHook(useLoading, { wrapper: LoadingProvider });
    const pending = pendingResponse();
    let request!: Promise<AxiosResponse>;

    await act(async () => {
      request = apiClient.get('/data-marts', { adapter: pending.adapter });
    });
    mounted.unmount();
    const remounted = renderHook(useLoading, { wrapper: LoadingProvider });

    try {
      expect(remounted.result.current.isLoading).toBe(true);
    } finally {
      await act(async () => {
        pending.finish();
        await request;
      });
    }
    expect(remounted.result.current.isLoading).toBe(false);
  });
});
