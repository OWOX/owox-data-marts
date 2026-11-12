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
import { withLoadingIndicator } from './api-loading';
import {
  ConnectProjectMismatchError,
  ConnectAccountMismatchError,
  getConnectProjectTarget,
  getPendingConnectProjectTarget,
  type ConnectProjectTarget,
} from '../../features/idp/utils/connect-project';

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
  connectProjectTarget?: ConnectProjectTarget | null;
  connectUserId?: string | null;
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

const apiClient: AxiosInstance = withLoadingIndicator(axios.create(axiosConfig));

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

/**
 * Refreshes the member's access token through the same shared refresh the 401 handling
 * below joins, so a caller outside axios never runs a second refresh beside it.
 */
export function refreshMemberAccessToken(): Promise<string> {
  const tokenProvider = getTokenProvider();
  if (!tokenProvider) {
    return Promise.reject(new Error('No token provider available'));
  }
  return authStateManager.refreshToken(() => tokenProvider.refreshToken());
}

function assertConnectSession(request: ExtendedInternalAxiosRequestConfig, token: string | null) {
  const target = request.connectProjectTarget;
  if (!target) return;
  const provider = getTokenProvider();
  const projectMatches =
    provider?.getProjectId?.() === target.projectId && provider.getAccessToken() === token;
  const userMatches =
    Boolean(request.connectUserId) && provider?.getUserId?.() === request.connectUserId;
  if (projectMatches && userMatches) return;
  const error = projectMatches
    ? new ConnectAccountMismatchError(target)
    : new ConnectProjectMismatchError(target);
  // Reject stale requests without redirecting a different page the user has since opened.
  if (getPendingConnectProjectTarget()?.url === target.url) {
    window.dispatchEvent(
      new CustomEvent('auth:logout', {
        detail: {
          reason: projectMatches ? 'connect_account_changed' : 'connect_project_mismatch',
          connectTarget: target.url,
        },
      })
    );
  }
  throw error;
}

// Request interceptor to add auth headers
apiClient.interceptors.request.use(
  (config: ExtendedInternalAxiosRequestConfig) => {
    if (config.skipAuthHeader) {
      return config;
    }

    // Keep the original target when a request is retried after navigation or token refresh.
    if (config.connectProjectTarget === undefined) {
      config.connectProjectTarget = getConnectProjectTarget(
        window.location.pathname + window.location.search + window.location.hash
      );
      config.connectUserId = config.connectProjectTarget
        ? (getTokenProvider()?.getUserId?.() ?? null)
        : null;
    }

    const headers = new AxiosHeaders(config.headers);
    if (headers.has('X-OWOX-Authorization')) {
      const authorization = headers.get('X-OWOX-Authorization');
      assertConnectSession(
        config,
        typeof authorization === 'string' ? authorization.replace(/^Bearer /, '') : null
      );
      return config;
    }

    const tokenProvider = getTokenProvider();
    const accessToken = tokenProvider?.getAccessToken() ?? authStateManager.getAccessToken();
    assertConnectSession(config, accessToken);

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
        const connectTarget = getPendingConnectProjectTarget();
        if (
          (cause instanceof ConnectProjectMismatchError ||
            cause instanceof ConnectAccountMismatchError) &&
          cause.target.url !== connectTarget?.url
        ) {
          return Promise.reject(cause);
        }
        authStateManager.clear();

        window.dispatchEvent(
          new CustomEvent('auth:logout', {
            detail: {
              reason:
                cause instanceof ConnectAccountMismatchError
                  ? 'connect_account_changed'
                  : cause instanceof ConnectProjectMismatchError
                    ? 'connect_project_mismatch'
                    : isBlockedUserError(cause)
                      ? 'user_blocked'
                      : 'token_refresh_failed',
              ...(connectTarget ? { connectTarget: connectTarget.url } : {}),
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

      // Each request must check a shared refresh result against its original project and account.
      assertConnectSession(originalRequest, newAccessToken);
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
