/**
 * Standard authentication routes that IDP implementations should provide
 */

// Authentication Pages Routes (GET - for user-facing pages)
export const AUTH_PAGE_ROUTES = {
  SIGN_IN: '/auth/sign-in',
  SIGN_OUT: '/auth/sign-out',
  SIGN_UP: '/auth/sign-up',
  MAGIC_LINK: '/auth/magic-link',
  MAGIC_LINK_VERIFY: '/auth/magic-link/verify',
  GOOGLE_CALLBACK: '/auth/google/callback',
  MICROSOFT_CALLBACK: '/auth/microsoft/callback',
  VERIFY_EMAIL: '/auth/verify-email',
  VERIFY_EMAIL_RESEND: '/auth/verify-email/resend',
  PASSWORD_RESET: '/auth/password-reset',
  PASSWORD_RESET_VERIFY: '/auth/password-reset/verify',
  PASSWORD_CHANGE: '/auth/password-change',
} as const;

// Authentication API Routes (POST - for programmatic access)
export const AUTH_API_ROUTES = {
  REFRESH: '/auth/api/refresh',
  REVOKE: '/auth/api/revoke',
  INTROSPECT: '/auth/api/introspect',
} as const;

export type AuthPageRoutes = (typeof AUTH_PAGE_ROUTES)[keyof typeof AUTH_PAGE_ROUTES];
export type AuthApiRoutes = (typeof AUTH_API_ROUTES)[keyof typeof AUTH_API_ROUTES];
