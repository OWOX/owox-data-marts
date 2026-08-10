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
  skipErrorToast?: boolean;
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
      } catch (error) {
        authStateManager.clear();

        window.dispatchEvent(
          new CustomEvent('auth:logout', {
            detail: {
              reason: isBlockedUserError(error) ? 'user_blocked' : 'token_refresh_failed',
            },
          })
        );

        return Promise.reject(new Error('Token refresh failed'));
      }
    }

    const skipErrorToast = (error.config as AxiosRequestConfig | undefined)?.skipErrorToast;

    if (error.response?.status === 404 && !skipErrorToast) {
      showApiErrorToast(error, 'Resource not found');
    }

    if (error.response?.status === 403 && !skipErrorToast) {
      const errorCode = (error.response.data as { code?: string } | undefined)?.code;
      const message =
        errorCode === 'ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE'
          ? 'This action is not available in view-only mode'
          : 'Access forbidden - insufficient permissions';
      showApiErrorToast(error, message, { persistent: true });
    }

    if (error.response?.status === 400 && !skipErrorToast) {
      showApiErrorToast(error, 'Bad request');
    }

    // A 5xx used to show the user NOTHING: only 400/403/404 were toasted, and the backend
    // deliberately sends no `message` for a non-HTTP exception (it could carry SQL or internals),
    // so a failed action just looked like it did nothing. Report the failure and the request id —
    // that id is the only handle support has to find the matching server log.
    const status = error.response?.status;
    if (status !== undefined && status >= 500 && !skipErrorToast) {
      const requestId = (error.response?.data as { requestId?: string } | undefined)?.requestId;
      // Passing `undefined` rather than the error on purpose: the server body carries no usable
      // message for a 5xx, and forwarding it risks surfacing an internal one if that ever changes.
      // Toast id keys on the status, not the message: every 5xx carries a fresh request id.
      showApiErrorToast(
        undefined,
        requestId
          ? `Something went wrong on our side. Request id: ${requestId}`
          : 'Something went wrong on our side. Please try again',
        { id: `server-error:${status}` }
      );
    }
    return Promise.reject(error);
  }
);

export default apiClient;
