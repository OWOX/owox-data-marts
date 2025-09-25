import { useAuth } from './useAuth';
import { AuthStatus, type User } from '../types';

/**
 * Hook to get current auth state
 */
export function useAuthState() {
  const { status, session, user, error } = useAuth();

  return {
    status,
    session,
    user,
    error,
    isLoading: status === AuthStatus.LOADING,
    isAuthenticated: status === AuthStatus.AUTHENTICATED,
    isUnauthenticated: status === AuthStatus.UNAUTHENTICATED,
    hasError: status === AuthStatus.ERROR,
  };
}

/**
 * Hook to get current user
 */
export function useUser(): User | null {
  const { user } = useAuth();
  return user;
}

/**
 * Hook to check if user is authenticated
 */
export function useIsAuthenticated(): boolean {
  const { status } = useAuth();
  return status === AuthStatus.AUTHENTICATED;
}

/**
 * Hook to get auth actions
 */
export function useAuthActions() {
  const { signIn, signOut, refreshToken, clearError } = useAuth();

  return {
    signIn,
    signOut,
    refreshToken,
    clearError,
  };
}
