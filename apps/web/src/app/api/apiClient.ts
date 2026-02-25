import axios, {
  type AxiosInstance,
  type AxiosRequestConfig as OriginalAxiosRequestConfig,
  AxiosError,
  type InternalAxiosRequestConfig,
  AxiosHeaders,
} from 'axios';
import { showApiErrorToast } from '../../shared/utils';
import { isBlockedUserError } from '../../features/idp/services/auth-api.service';
import { AuthStateManager } from './auth-state-manager';
import { getTokenProvider } from './token-provider';

// Extend AxiosRequestConfig to include our custom properties
export interface AxiosRequestConfig extends OriginalAxiosRequestConfig {
  skipLoadingIndicator?: boolean;
  skipAuthHeader?: boolean;
}

// Extend InternalAxiosRequestConfig to include our custom properties
interface ExtendedInternalAxiosRequestConfig extends InternalAxiosRequestConfig {
  skipAuthHeader?: boolean;
  _retry?: boolean;
}

// Default config for the axios instance
const axiosConfig: AxiosRequestConfig = {
  // Base URL for API requests
  baseURL: import.meta.env.VITE_PUBLIC_API_URL || '/api',

  // Request timeout in milliseconds
  timeout: 30000,

  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
};

const apiClient: AxiosInstance = axios.create(axiosConfig);

const authStateManager = new AuthStateManager();

// Request interceptor to add auth headers
apiClient.interceptors.request.use(
  (config: ExtendedInternalAxiosRequestConfig) => {
    if (config.skipAuthHeader) {
      return config;
    }

    const headers = new AxiosHeaders(config.headers);
    if (headers.has('X-OWOX-Authorization')) {
      return config;
    }

    const tokenProvider = getTokenProvider();
    const accessToken = tokenProvider?.getAccessToken() ?? authStateManager.getAccessToken();

    if (accessToken) {
      config.headers['X-OWOX-Authorization'] = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error: unknown) => {
    return Promise.reject(error instanceof Error ? error : new Error('Unknown error'));
  }
);

// Response interceptor for error handling and token refresh
apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as ExtendedInternalAxiosRequestConfig;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const tokenProvider = getTokenProvider();
        if (!tokenProvider) {
          throw new Error('No token provider available');
        }

        const newAccessToken = await authStateManager.refreshToken(() =>
          tokenProvider.refreshToken()
        );

        originalRequest.headers['X-OWOX-Authorization'] = `Bearer ${newAccessToken}`;

        return await apiClient(originalRequest);
      } catch (refreshError) {
        authStateManager.clear();

        const isBlocked = isBlockedUserError(refreshError);

        window.dispatchEvent(
          new CustomEvent('auth:logout', {
            detail: {
              reason: isBlocked ? 'user_blocked' : 'token_refresh_failed',
              requiresSignOut: isBlocked,
            },
          })
        );

        return Promise.reject(new Error('Token refresh failed'));
      }
    }

    if (error.response?.status === 404) {
      showApiErrorToast(error, 'Resource not found');
    }

    if (error.response?.status === 403) {
      showApiErrorToast(error, 'Access forbidden - insufficient permissions');
    }

    if (error.response?.status === 400) {
      showApiErrorToast(error, 'Bad request');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
