import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type AxiosRequestConfig } from 'axios';

vi.mock('../../shared/utils', () => ({ showApiErrorToast: vi.fn() }));

vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn(),
      },
      response: {
        use: vi.fn(),
      },
    },
  };

  return {
    __esModule: true,
    default: {
      create: vi.fn().mockReturnValue(mockAxiosInstance),
    },
  };
});

describe('apiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create axios instance with correct configuration', async () => {
    const expectedConfig: AxiosRequestConfig = {
      baseURL: '/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    const axios = await import('axios');
    await import('./apiClient');

    expect(axios.default.create).toHaveBeenCalledWith(expectedConfig);
  });

  it('should be an axios instance', async () => {
    const apiClient = (await import('./apiClient')).default;
    expect(apiClient).toBeDefined();
    expect(typeof apiClient.get).toBe('function');
    expect(typeof apiClient.post).toBe('function');
  });
});

// A failed request used to be INVISIBLE on a 5xx: only 400/403/404 were toasted, and the
// backend deliberately sends no `message` for a non-HTTP exception, so an action that hit a
// server error simply looked like it had done nothing at all.
describe('apiClient — server-error toast', () => {
  const rejectionHandler = async () => {
    const axios = await import('axios');
    await import('./apiClient');
    const instance = (axios.default.create as unknown as ReturnType<typeof vi.fn>).mock.results[0]
      .value as { interceptors: { response: { use: ReturnType<typeof vi.fn> } } };
    return instance.interceptors.response.use.mock.calls[0][1] as (e: unknown) => Promise<never>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('reports a 500 and quotes the request id support needs to find the log', async () => {
    const { showApiErrorToast } = await import('../../shared/utils');
    const onRejected = await rejectionHandler();

    await expect(
      onRejected({ response: { status: 500, data: { requestId: 'req-42' } }, config: {} })
    ).rejects.toBeDefined();

    expect(showApiErrorToast).toHaveBeenCalledWith(
      undefined,
      expect.stringContaining('req-42'),
      expect.anything()
    );
  });

  it('still reports a 5xx that carries no request id', async () => {
    const { showApiErrorToast } = await import('../../shared/utils');
    const onRejected = await rejectionHandler();

    await expect(
      onRejected({ response: { status: 503, data: {} }, config: {} })
    ).rejects.toBeDefined();

    expect(showApiErrorToast).toHaveBeenCalledWith(
      undefined,
      expect.stringContaining('try again'),
      expect.anything()
    );
  });

  // Each 5xx carries a fresh request id, so keying the toast on its message would still stack.
  it('collapses repeated server errors onto one stable toast id', async () => {
    const { showApiErrorToast } = await import('../../shared/utils');
    const onRejected = await rejectionHandler();

    await expect(
      onRejected({ response: { status: 500, data: { requestId: 'req-1' } }, config: {} })
    ).rejects.toBeDefined();
    await expect(
      onRejected({ response: { status: 500, data: { requestId: 'req-2' } }, config: {} })
    ).rejects.toBeDefined();

    expect(showApiErrorToast).toHaveBeenNthCalledWith(1, undefined, expect.any(String), {
      id: 'server-error:500',
    });
    expect(showApiErrorToast).toHaveBeenNthCalledWith(2, undefined, expect.any(String), {
      id: 'server-error:500',
    });
  });

  it('honours skipErrorToast, so a caller rendering its own error is not double-reported', async () => {
    const { showApiErrorToast } = await import('../../shared/utils');
    const onRejected = await rejectionHandler();

    await expect(
      onRejected({ response: { status: 500, data: {} }, config: { skipErrorToast: true } })
    ).rejects.toBeDefined();

    expect(showApiErrorToast).not.toHaveBeenCalled();
  });
});
