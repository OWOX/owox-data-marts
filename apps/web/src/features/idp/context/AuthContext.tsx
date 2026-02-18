import React, { useCallback, useEffect, useReducer } from 'react';
import {
  clearTokenProvider,
  DefaultTokenProvider,
  setTokenProvider,
} from '../../../app/api/token-provider';
import { pushToDataLayer, trackLogout, trackUserIdentified } from '../../../utils/data-layer';
import {
  getUserApi,
  refreshAccessToken as refreshAccessTokenApi,
  signIn as signInApi,
  signOut as signOutApi,
} from '../services';
import { AuthStatus, type AuthSession, type AuthState, type User } from '../types';
import { AuthContext, type AuthContextType } from './AuthContext.types';

/**
 * Auth reducer actions
 */
type AuthAction =
  | { type: 'SET_LOADING' }
  | { type: 'SET_AUTHENTICATED'; payload: { session: AuthSession } }
  | { type: 'SET_UNAUTHENTICATED' }
  | { type: 'SET_ERROR'; payload: string }
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
      };

    case 'SET_AUTHENTICATED':
      return {
        ...state,
        status: AuthStatus.AUTHENTICATED,
        session: action.payload.session,
        error: undefined,
      };

    case 'SET_UNAUTHENTICATED':
      return {
        ...state,
        status: AuthStatus.UNAUTHENTICATED,
        session: null,
        error: undefined,
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
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: undefined,
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

  const performSignOut = () => {
    try {
      trackLogout();
    } finally {
      signOutApi();
    }
  };

  /**
   * Redirect to sign-in page
   */
  const signIn = useCallback(() => {
    signInApi();
  }, []);

  const refresh = useCallback(async (): Promise<string> => {
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

      dispatch({
        type: 'SET_USER',
        payload: { user },
      });

      dispatch({
        type: 'SET_AUTHENTICATED',
        payload: { session: newSession },
      });
      return accessToken;
    } catch (error: unknown) {
      clearTokenProvider();
      dispatch({ type: 'SET_UNAUTHENTICATED' });

      // Якщо бекенд повертає 403 (INACTIVE/blocked) — виконуємо локальний signOut без зовнішнього редіректу
      if (
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        (error as { statusCode?: number }).statusCode === 403
      ) {
        performSignOut();
        const errObj = error as { message?: string; statusCode?: number; code?: string };
        const forbiddenError = Object.assign(new Error(errObj.message ?? 'Forbidden'), errObj);
        return Promise.reject(forbiddenError);
      }

      throw error;
    }
  }, []);

  useEffect(() => {
    if (state.session?.accessToken) {
      const tokenProvider = new DefaultTokenProvider(
        () => state.session?.accessToken ?? null,
        async () => {
          // Need refresh with update session and user in the state
          // for example when user change name we want to have updated user info
          return await refresh();
        }
      );
      setTokenProvider(tokenProvider);
    } else {
      clearTokenProvider();
    }
  }, [state.session?.accessToken, refresh]);

  /**
   * Refresh access token using http-only cookie
   */
  const refreshToken = useCallback(async () => {
    await refresh();
  }, [refresh]);

  /**
   * Initialize auth state from storage
   */
  const initializeAuth = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING' });

      try {
        await refreshToken();
      } catch (err) {
        dispatch({ type: 'SET_UNAUTHENTICATED' });

        // 403 -> виконуємо локальний signOut (очистка + редірект на sign-out сторінку IdP)
        if (
          err &&
          typeof err === 'object' &&
          'statusCode' in err &&
          (err as { statusCode?: number }).statusCode === 403
        ) {
          performSignOut();
          return;
        }

        signIn();
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      clearTokenProvider();
      dispatch({ type: 'SET_UNAUTHENTICATED' });
    }
  }, [refreshToken, signIn]);

  /**
   * Redirect to sign-out page and clear local session
   */
  const signOut = useCallback(() => {
    performSignOut();
  }, []);

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
    if (state.user) {
      pushToDataLayer({ projectId: state.user.projectId });
      trackUserIdentified({
        userId: state.user.id,
        userEmail: state.user.email,
        userFullName: state.user.fullName,
      });
    }
  }, [state.user]);

  useEffect(() => {
    const handleLogout = () => {
      signOut();
    };

    window.addEventListener('auth:logout', handleLogout);

    return () => {
      window.removeEventListener('auth:logout', handleLogout);
      clearTokenProvider();
    };
  }, [signOut]);

  const contextValue: AuthContextType = {
    ...state,
    signIn,
    signOut,
    refreshToken,
    clearError,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
