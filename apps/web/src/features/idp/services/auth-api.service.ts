import axios from 'axios';
import type { AccessTokenResponse, AuthError, Projects, User } from '../types';

/**
 * Auth API endpoints configuration
 * These should match the routes defined in IdP Protocol middleware
 */
const AUTH_ENDPOINTS = {
  SIGN_IN: '/auth/sign-in',
  SIGN_OUT: '/auth/sign-out',
  ACCESS_TOKEN: '/auth/access-token',
  API_USER: '/auth/api/user',
  API_PROJECTS: '/auth/api/projects',
} as const;

/**
 * Handle authentication-specific errors
 */
function handleAuthError(error: unknown): AuthError {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response: { status: number; data?: { message?: string } } };
    const { status, data } = axiosError.response;

    switch (status) {
      case 401:
        return {
          message: data?.message ?? 'Invalid credentials or session expired',
          code: 'UNAUTHORIZED',
          statusCode: 401,
        };
      case 403:
        return {
          message: data?.message ?? 'Access forbidden',
          code: 'FORBIDDEN',
          statusCode: 403,
        };
      case 422:
        return {
          message: data?.message ?? 'Invalid request data',
          code: 'VALIDATION_ERROR',
          statusCode: 422,
        };
      default:
        return {
          message: data?.message ?? 'Authentication error',
          code: 'AUTH_ERROR',
          statusCode: status,
        };
    }
  }

  if (error && typeof error === 'object' && 'request' in error) {
    return {
      message: 'Network error - please check your connection',
      code: 'NETWORK_ERROR',
    };
  }

  const message = error instanceof Error ? error.message : 'Unknown authentication error';
  return {
    message,
    code: 'UNKNOWN_ERROR',
  };
}

const authClient = axios.create({
  baseURL: import.meta.env.VITE_PUBLIC_API_URL || '/',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  withCredentials: true,
});

/**
 * Redirect to sign-in page
 * The sign-in page will handle authentication and set http-only cookies
 */
export function signIn(): void {
  const currentPath = window.location.pathname + window.location.search;
  const signInUrl = new URL(AUTH_ENDPOINTS.SIGN_IN, window.location.origin);

  if (!currentPath.startsWith('/auth/')) {
    signInUrl.searchParams.set('redirect', currentPath);
  }

  window.location.href = signInUrl.toString();
}

/**
 * Redirect to sign-out page
 * The sign-out page will clear cookies and redirect appropriately
 */
export function signOut(): void {
  const signOutUrl = new URL(AUTH_ENDPOINTS.SIGN_OUT, window.location.origin);

  signOutUrl.searchParams.set('redirect', AUTH_ENDPOINTS.SIGN_IN);

  window.location.href = signOutUrl.toString();
}

/**
 * Get new access token using refresh token from http-only cookie
 */
export async function refreshAccessToken(): Promise<AccessTokenResponse> {
  try {
    const response = await authClient.post<AccessTokenResponse>(AUTH_ENDPOINTS.ACCESS_TOKEN, {});
    return response.data;
  } catch (error: unknown) {
    const authError = handleAuthError(error);
    throw new Error(authError.message);
  }
}

export async function getUserApi(token: string): Promise<User> {
  const response = await authClient.get<User>(AUTH_ENDPOINTS.API_USER, {
    headers: {
      'X-OWOX-Authorization': `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function getProjectsApi(token: string): Promise<Projects> {
  const response = await authClient.get<Projects>(AUTH_ENDPOINTS.API_PROJECTS, {
    headers: {
      'X-OWOX-Authorization': `Bearer ${token}`,
    },
  });
  return response.data;
}

/**
 * Authentication API service object for backward compatibility
 */
export const AuthApiService = {
  signIn,
  signOut,
  refreshAccessToken,
  getUserApi,
  getProjectsApi,
};

// Export as default for convenience
export default AuthApiService;
