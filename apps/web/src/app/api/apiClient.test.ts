import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type AxiosRequestConfig } from 'axios';

vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
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
