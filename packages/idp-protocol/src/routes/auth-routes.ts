/**
 * Standard authentication routes that IDP implementations should provide
 */

// Authentication Pages Routes (GET - for user-facing pages)
export const AUTH_PAGE_ROUTES = {
  SIGN_IN: '/auth/sign-in',
  SIGN_OUT: '/auth/sign-out',
  SIGN_UP: '/auth/sign-up',
} as const;

// Authentication API Routes (POST - for programmatic access)
export const AUTH_API_ROUTES = {
  REFRESH: '/auth/api/refresh',
  REVOKE: '/auth/api/revoke',
  INTROSPECT: '/auth/api/introspect',
} as const;

export type AuthPageRoutes = (typeof AUTH_PAGE_ROUTES)[keyof typeof AUTH_PAGE_ROUTES];
export type AuthApiRoutes = (typeof AUTH_API_ROUTES)[keyof typeof AUTH_API_ROUTES];
