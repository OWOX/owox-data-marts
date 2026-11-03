import React, { useReducer, useEffect, useCallback, useRef } from 'react';
import { AuthStatus, type AuthState, type AuthSession, type User } from '../types';
import { AuthContext, type AuthContextType } from './AuthContext.types';
import {
  signIn as signInApi,
  signOut as signOutApi,
  refreshAccessToken as refreshAccessTokenApi,
  getUserApi,
  RedirectStorageService,
  isBlockedUserError,
  isViewOnlySession,
} from '../services';
import { getProjectIdFromPath } from '../utils/project-id';
import {
  ConnectProjectMismatchError,
  ConnectAccountMismatchError,
  CONNECT_SWITCH_ATTEMPT_KEY,
  getConnectProjectTarget,
  getPendingConnectProjectTarget,
  type ConnectProjectTarget,
} from '../utils/connect-project';
import {
  isOnboardingStepPath,
  requestAccessRedirectTarget,
  storedRedirectTarget,
} from '../utils/post-auth-redirect';
import {
  setTokenProvider,
  clearTokenProvider,
  DefaultTokenProvider,
  getTokenProvider,
} from '../../../app/api/token-provider';
import {
  pushToDataLayer,
  trackUserIdentified,
  trackLogout,
  suppressClientAnalytics,
  setAnalyticsDisabled,
} from '../../../utils';
import { buildProjectPath } from '../../../utils/path';
import {
  buildProjectRequestAccessPath,
  getSafeProjectRedirect,
  isProjectRequestAccessPath,
  LEGACY_REQUEST_ACCESS_PATH,
} from '../../user-provisioning/utils/request-access-routing';

function hasEmptyProjectRoles(user: User): boolean {
  return Array.isArray(user.roles) && user.roles.length === 0;
}

/**
 * Auth reducer actions
 */
type AuthAction =
  | { type: 'SET_LOADING' }
  | { type: 'SET_AUTHENTICATED'; payload: { session: AuthSession } }
  | { type: 'SET_UNAUTHENTICATED' }
  | { type: 'SET_ERROR'; payload: string; code?: AuthState['errorCode'] }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_USER'; payload: { user: User } };

/**
 * Auth reducer
 */
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        status: AuthStatus.LOADING,
        error: undefined,
        errorCode: undefined,
      };

    case 'SET_AUTHENTICATED':
      return {
        ...state,
        status: AuthStatus.AUTHENTICATED,
        session: action.payload.session,
        error: undefined,
        errorCode: undefined,
      };

    case 'SET_UNAUTHENTICATED':
      return {
        ...state,
        status: AuthStatus.UNAUTHENTICATED,
        session: null,
        error: undefined,
        errorCode: undefined,
      };

    case 'SET_USER':
      return {
        ...state,
        user: action.payload.user,
      };

    case 'SET_ERROR':
      return {
        ...state,
        status: AuthStatus.ERROR,
        error: action.payload,
        errorCode: action.code,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: undefined,
        errorCode: undefined,
      };

    default:
      return state;
  }
}

/**
 * Initial auth state
 */
const initialState: AuthState = {
  status: AuthStatus.LOADING,
  session: null,
  user: null,
};

/**
 * Auth provider props
 */
interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Auth provider component
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const pendingConnectSignIn = useRef<string | null>(null);

  /**
   * Redirect to sign-in page
   */
  const signIn = useCallback(() => {
    const connectTarget = getPendingConnectProjectTarget();
    if (connectTarget) {
      pendingConnectSignIn.current = connectTarget.url;
      signInApi({ projectId: connectTarget.projectId, redirect: connectTarget.url });
      return;
    }
    const currentPath = window.location.pathname;
    const projectId = getProjectIdFromPath(currentPath);
    signInApi(projectId ? { projectId } : undefined);
  }, []);

  const handleConnectMismatch = useCallback((target: ConnectProjectTarget) => {
    clearTokenProvider();
    dispatch({ type: 'SET_ERROR', payload: new ConnectProjectMismatchError(target).message });
    // Keep the return URL when another auth result arrives before sign-in navigation completes.
    if (pendingConnectSignIn.current === target.url) return;
    const attempted = sessionStorage.getItem(CONNECT_SWITCH_ATTEMPT_KEY) === target.url;
    if (!attempted) {
      RedirectStorageService.save(target.url);
      sessionStorage.setItem(CONNECT_SWITCH_ATTEMPT_KEY, target.url);
      pendingConnectSignIn.current = target.url;
      signInApi({ projectId: target.projectId, redirect: target.url });
      return;
    }
    RedirectStorageService.clear();
    // A failed switch returns to the blocked setup page. The user can retry there.
    const currentUrl = window.location.pathname + window.location.search + window.location.hash;
    if (currentUrl !== target.url) window.location.replace(target.url);
  }, []);

  const handleAccountMismatch = useCallback((target: ConnectProjectTarget) => {
    clearTokenProvider();
    RedirectStorageService.save(target.url);
    dispatch({
      type: 'SET_ERROR',
      payload: new ConnectAccountMismatchError(target).message,
      code: 'CONNECT_ACCOUNT_CHANGED',
    });
  }, []);

  const refresh = useCallback(
    async function refreshSession(): Promise<{ accessToken: string; user: User }> {
      const expectedTarget = getPendingConnectProjectTarget();
      const expectedUserId = expectedTarget ? getTokenProvider()?.getUserId?.() : null;
      try {
        const response = await refreshAccessTokenApi();

        const accessToken = response.accessToken;

        if (!accessToken) {
          throw new Error('Invalid token received');
        }

        const newSession: AuthSession = {
          accessToken,
        };

        const user = await getUserApi(accessToken);

        for (const target of [expectedTarget, getPendingConnectProjectTarget()]) {
          if (target && user.projectId !== target.projectId) {
            throw new ConnectProjectMismatchError(target);
          }
        }

        if (expectedTarget && expectedUserId && user.id !== expectedUserId) {
          throw new ConnectAccountMismatchError(expectedTarget);
        }

        // Install the verified token, project, and account before requests can use the new session.
        setTokenProvider(
          new DefaultTokenProvider(
            () => accessToken,
            async () => (await refreshSession()).accessToken,
            () => user.projectId,
            () => user.id
          )
        );
        if (expectedTarget) sessionStorage.removeItem(CONNECT_SWITCH_ATTEMPT_KEY);

        dispatch({
          type: 'SET_USER',
          payload: { user },
        });

        dispatch({
          type: 'SET_AUTHENTICATED',
          payload: { session: newSession },
        });
        return { accessToken, user };
      } catch (error: unknown) {
        clearTokenProvider();
        if (error instanceof ConnectAccountMismatchError) {
          handleAccountMismatch(error.target);
        } else if (error instanceof ConnectProjectMismatchError) {
          dispatch({ type: 'SET_ERROR', payload: error.message });
        } else if (expectedTarget) {
          dispatch({
            type: 'SET_ERROR',
            payload:
              'OWOX could not refresh your session. Sign in to the setup project to continue.',
          });
        } else {
          dispatch({ type: 'SET_UNAUTHENTICATED' });
        }
        throw error;
      }
    },
    [handleAccountMismatch]
  );

  /**
   * Refresh access token using http-only cookie
   */
  const refreshToken = useCallback(async () => {
    await refresh();
  }, [refresh]);

  /**
   * Redirect to sign-out page and clear local session
   */
  const signOut = useCallback(() => {
    try {
      trackLogout();
    } finally {
      signOutApi();
    }
  }, []);

  /**
   * Initialize auth state from storage
   */
  const initializeAuth = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING' });

      try {
        const { user } = await refresh();
        const currentPath = window.location.pathname;
        const currentUrl = window.location.pathname + window.location.search + window.location.hash;

        // The incoming connect URL takes priority over an older saved redirect.
        if (getConnectProjectTarget(currentUrl)) {
          RedirectStorageService.clear();
          if (!hasEmptyProjectRoles(user)) return;
        }

        if (hasEmptyProjectRoles(user)) {
          const isRequestAccessPath =
            currentPath === LEGACY_REQUEST_ACCESS_PATH ||
            isProjectRequestAccessPath(
              currentPath,
              getProjectIdFromPath(currentPath) ?? user.projectId
            );

          if (!isRequestAccessPath) {
            const storedRedirect = RedirectStorageService.retrieve();
            if (storedRedirect) {
              RedirectStorageService.clear();
            }
            const redirectTo = requestAccessRedirectTarget({
              storedRedirect,
              currentUrl,
              currentPath,
              projectId: user.projectId,
            });
            const targetUrl = new URL(redirectTo, window.location.origin);
            // A project switch returns through /; restore the saved access page with its MCP label.
            const target =
              targetUrl.origin === window.location.origin &&
              isProjectRequestAccessPath(targetUrl.pathname, user.projectId)
                ? `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`
                : buildProjectRequestAccessPath(user.projectId, redirectTo);
            window.location.replace(target);
          }
          return;
        }

        if (
          currentPath === LEGACY_REQUEST_ACCESS_PATH ||
          isProjectRequestAccessPath(currentPath, user.projectId)
        ) {
          window.location.replace(
            getSafeProjectRedirect(window.location.search, user.projectId) ??
              buildProjectPath(user.projectId, '/data-marts')
          );
          return;
        }

        // An onboarding step (the invite step after sign-up) takes the stored deep link over
        // and continues to it once the user is done, instead of being skipped here.
        const storedRedirect = isOnboardingStepPath(currentPath)
          ? null
          : RedirectStorageService.retrieve();
        if (storedRedirect) {
          RedirectStorageService.clear();
          const target = storedRedirectTarget({
            storedRedirect,
            currentUrl: window.location.pathname + window.location.search + window.location.hash,
            projectId: user.projectId,
          });
          if (target) {
            window.location.replace(target);
            return;
          }
        }
      } catch (error) {
        if (error instanceof ConnectAccountMismatchError) {
          handleAccountMismatch(error.target);
          return;
        }
        if (error instanceof ConnectProjectMismatchError) {
          handleConnectMismatch(error.target);
          return;
        }
        if (!getPendingConnectProjectTarget()) dispatch({ type: 'SET_UNAUTHENTICATED' });
        if (isBlockedUserError(error)) {
          signOut();
        } else {
          signIn();
        }
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      clearTokenProvider();
      dispatch({ type: 'SET_UNAUTHENTICATED' });
    }
  }, [signIn, signOut, handleConnectMismatch, handleAccountMismatch, refresh]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (!state.user) {
      return;
    }

    // View-only: do not identify the user or emit analytics events.
    if (isViewOnlySession(state.user)) {
      suppressClientAnalytics();
      return;
    }

    setAnalyticsDisabled(false);
    pushToDataLayer({ projectId: state.user.projectId });
    trackUserIdentified({
      userId: state.user.id,
      userEmail: state.user.email,
      userFullName: state.user.fullName,
    });
  }, [state.user]);

  useEffect(() => {
    const handleLogout = (event: CustomEvent) => {
      const detail = (event.detail ?? {}) as { reason?: string; connectTarget?: string };
      const connectTarget = getConnectProjectTarget(detail.connectTarget ?? '');

      if (detail.reason === 'connect_account_changed') {
        if (connectTarget) handleAccountMismatch(connectTarget);
        return;
      }

      if (detail.reason === 'connect_project_mismatch') {
        if (connectTarget) handleConnectMismatch(connectTarget);
        return;
      }

      // Blocked/inactive users need sign-out
      if (detail.reason === 'user_blocked') {
        if (connectTarget) RedirectStorageService.save(connectTarget.url);
        signOut();
      } else if (connectTarget) {
        pendingConnectSignIn.current = connectTarget.url;
        signInApi({ projectId: connectTarget.projectId, redirect: connectTarget.url });
      } else {
        // Regular token refresh failure - just redirect to sign-in
        signIn();
      }
    };

    window.addEventListener('auth:logout', handleLogout as EventListener);

    return () => {
      window.removeEventListener('auth:logout', handleLogout as EventListener);
      clearTokenProvider();
    };
  }, [signIn, signOut, handleConnectMismatch, handleAccountMismatch]);

  const contextValue: AuthContextType = {
    ...state,
    signIn,
    signOut,
    refreshToken,
    clearError,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
