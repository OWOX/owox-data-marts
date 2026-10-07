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

/**
 * Rejections this interceptor already reported with a toast (400, 403, 404, 5xx). A caller that
 * catches the rejection asks `wasErrorToastShown` before reporting it again, so a failure is
 * shown exactly once — and one the interceptor stays silent on (a network failure, a 409) is
 * not lost.
 */
const toastedErrors = new WeakSet();

export function wasErrorToastShown(error: unknown): boolean {
  return typeof error === 'object' && error !== null && toastedErrors.has(error);
}

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

      const signOut = (cause: unknown) => {
        authStateManager.clear();

        window.dispatchEvent(
          new CustomEvent('auth:logout', {
            detail: {
              reason: isBlockedUserError(cause) ? 'user_blocked' : 'token_refresh_failed',
            },
          })
        );

        return Promise.reject(new Error('Token refresh failed'));
      };

      let newAccessToken: string;
      try {
        const tokenProvider = getTokenProvider();
        if (!tokenProvider) {
          throw new Error('No token provider available');
        }

        newAccessToken = await authStateManager.refreshToken(() => tokenProvider.refreshToken());
      } catch (refreshError) {
        return signOut(refreshError);
      }

      originalRequest.headers['X-OWOX-Authorization'] = `Bearer ${newAccessToken}`;
      try {
        return await apiClient(originalRequest);
      } catch (retryError) {
        // Only a refused token signs the user out. Any other failure of the retried request is
        // that request's own answer — a 400 naming the field to fix, a 404 — already reported by
        // this interceptor on its way through, and passed on to the caller unchanged.
        if ((retryError as AxiosError | undefined)?.response?.status === 401) {
          return signOut(retryError);
        }
        throw retryError;
      }
    }

    const skipErrorToast = (error.config as AxiosRequestConfig | undefined)?.skipErrorToast;

    if (error.response?.status === 404 && !skipErrorToast) {
      showApiErrorToast(error, 'Resource not found');
      toastedErrors.add(error);
    }

    if (error.response?.status === 403 && !skipErrorToast) {
      const errorCode = (error.response.data as { code?: string } | undefined)?.code;
      const message =
        errorCode === 'ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE'
          ? 'This action is not available in view-only mode'
          : 'Access forbidden - insufficient permissions';
      showApiErrorToast(error, message, { persistent: true });
      toastedErrors.add(error);
    }

    if (error.response?.status === 400 && !skipErrorToast) {
      showApiErrorToast(error, 'Bad request');
      toastedErrors.add(error);
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
      toastedErrors.add(error);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
