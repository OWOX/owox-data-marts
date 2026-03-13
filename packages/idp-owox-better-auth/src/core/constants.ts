/** Cookie name for core refresh token. */
export const CORE_REFRESH_TOKEN_COOKIE = 'refreshToken';
/** Cookie name for Better Auth session token. */
export const BETTER_AUTH_SESSION_COOKIE = 'better-auth.session_token';
/** Cookie name for Better Auth CSRF token. */
export const BETTER_AUTH_CSRF_COOKIE = 'better-auth.csrf_token';
/** Cookie name for Better Auth OAuth state. */
export const BETTER_AUTH_STATE_COOKIE = 'better-auth.state';

/** Base path for IDP auth routes. */
export const AUTH_BASE_PATH = '/auth';
/** Base path for Better Auth routes. */
export const BETTER_AUTH_BASE_PATH = `${AUTH_BASE_PATH}/better-auth`;

/** Magic-link intent values used in query/body contracts. */
export const MAGIC_LINK_INTENT = {
  SIGNUP: 'signup',
  RESET: 'reset',
} as const;

export type MagicLinkIntentValue = (typeof MAGIC_LINK_INTENT)[keyof typeof MAGIC_LINK_INTENT];

export function isMagicLinkIntent(value: unknown): value is MagicLinkIntentValue {
  return value === MAGIC_LINK_INTENT.SIGNUP || value === MAGIC_LINK_INTENT.RESET;
}

export function parseMagicLinkIntent(value: unknown): MagicLinkIntentValue | undefined {
  return isMagicLinkIntent(value) ? value : undefined;
}

/** Source parameter values used across IDP requests. */
export const SOURCE = {
  APP: 'app',
  PLATFORM: 'platform',
} as const;
