export type Role = 'admin' | 'editor' | 'viewer';

/**
 * User information
 */
export interface User {
  id: string;
  email?: string;
  fullName?: string;
  avatar?: string;
  roles?: Role[];
  projectId: string;
  projectTitle?: string;
}

/**
 * Authentication state enumeration
 */
export enum AuthStatus {
  LOADING = 'loading',
  AUTHENTICATED = 'authenticated',
  UNAUTHENTICATED = 'unauthenticated',
  ERROR = 'error',
}

/**
 * Authentication session data
 */
export interface AuthSession {
  accessToken: string | null;
}

/**
 * Authentication state
 */
export interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  user: User | null;
  error?: string;
}

/**
 * Authentication actions
 */
export interface AuthActions {
  signIn: (options?: { projectId?: string; redirect?: string; skipRedirectSave?: boolean }) => void;
  signOut: () => void;
  refreshToken: () => Promise<void>;
  clearError: () => void;
}
