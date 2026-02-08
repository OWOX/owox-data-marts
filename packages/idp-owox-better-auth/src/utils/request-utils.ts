import { type Request, type Response } from 'express';
import {
  buildCookieOptions,
  clearCookie as clearCookieWithPolicy,
  isSecureRequest,
} from './cookie-policy.js';
import {
  BETTER_AUTH_CSRF_COOKIE,
  BETTER_AUTH_SESSION_COOKIE,
  BETTER_AUTH_STATE_COOKIE,
  CORE_REFRESH_TOKEN_COOKIE,
} from '../constants.js';

export { isSecureRequest };

/**
 * Parameters used for Platform redirects and context persistence.
 */
export interface PlatformParams {
  redirectTo?: string;
  appRedirectTo?: string;
  source?: string;
  clientId?: string;
  codeChallenge?: string;
  projectId?: string;
}

const STATE_COOKIE = 'idp-owox-state';
const PLATFORM_PARAMS_COOKIE = 'idp-owox-params';

/**
 * Reads a cookie value from request headers or cookie parser.
 */
export function getCookie(req: Request, name: string): string | undefined {
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
  if (cookies && typeof cookies[name] === 'string') {
    return cookies[name];
  }

  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match && match[1] ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Sets a cookie using the shared cookie policy.
 */
export function setCookie(
  res: Response,
  req: Request,
  name: string,
  value: string,
  options?: { maxAgeMs?: number }
): void {
  res.cookie(name, value, buildCookieOptions(req, options));
}

/**
 * Clears a cookie using the shared cookie policy when request is available.
 */
export function clearCookie(res: Response, name: string, req?: Request): void {
  clearCookieWithPolicy(res, name, req);
}

/**
 * Clears Platform flow cookies (state and params).
 */
export function clearPlatformCookies(res: Response, req?: Request): void {
  clearCookie(res, STATE_COOKIE, req);
  clearCookie(res, PLATFORM_PARAMS_COOKIE, req);
}

/**
 * Clears Better Auth session and CSRF cookies.
 */
export function clearBetterAuthCookies(res: Response, req?: Request): void {
  clearCookie(res, BETTER_AUTH_SESSION_COOKIE, req);
  clearCookie(res, BETTER_AUTH_CSRF_COOKIE, req);
  clearCookie(res, BETTER_AUTH_STATE_COOKIE, req);
}

/**
 * Persists the PKCE state into a cookie.
 */
export function persistStateCookie(req: Request, res: Response, state: string): void {
  if (!state) return;
  setCookie(res, req, STATE_COOKIE, state);
}

/**
 * Extracts state from cookie or query, with mismatch protection.
 */
export function extractState(req: Request): string {
  const stateFromCookie = getCookie(req, STATE_COOKIE);
  const queryState = typeof req.query?.state === 'string' ? req.query.state : '';
  if (stateFromCookie && queryState && stateFromCookie !== queryState) {
    return '';
  }
  return stateFromCookie || queryState || '';
}

/**
 * Extracts state only from the cookie.
 */
export function extractStateFromCookie(req: Request): string {
  return getCookie(req, STATE_COOKIE) || '';
}

/**
 * Returns true when cookie state and query state mismatch.
 */
export function hasStateMismatch(req: Request): boolean {
  const stateFromCookie = getCookie(req, STATE_COOKIE);
  const queryState = typeof req.query?.state === 'string' ? req.query.state : '';
  return Boolean(stateFromCookie && queryState && stateFromCookie !== queryState);
}

/**
 * Extracts redirect parameters from cookie or query.
 */
export function extractPlatformParams(req: Request): PlatformParams {
  const cookiePayload = getCookie(req, PLATFORM_PARAMS_COOKIE);
  if (cookiePayload) {
    try {
      const parsed = JSON.parse(decodeURIComponent(cookiePayload)) as Record<
        string,
        string | undefined
      >;
      return {
        redirectTo: parsed.redirectTo,
        appRedirectTo: parsed.appRedirectTo,
        source: parsed.source,
        clientId: parsed.clientId,
        codeChallenge: parsed.codeChallenge,
        projectId: parsed.projectId,
      };
    } catch {
      // ignore malformed cookie
    }
  }

  const redirectTo =
    (typeof req.query?.['redirect-to'] === 'string' && req.query['redirect-to']) ||
    (typeof req.query?.redirectTo === 'string' && req.query.redirectTo) ||
    undefined;
  const appRedirectTo =
    (typeof req.query?.['app-redirect-to'] === 'string' && req.query['app-redirect-to']) ||
    undefined;
  const source = typeof req.query?.source === 'string' ? req.query.source : undefined;
  const clientId = typeof req.query?.clientId === 'string' ? req.query.clientId : undefined;
  const codeChallenge =
    (typeof req.query?.codeChallenge === 'string' && req.query.codeChallenge) ||
    (typeof req.query?.codechallenge === 'string' && req.query.codechallenge) ||
    undefined;
  const projectId = typeof req.query?.projectId === 'string' ? req.query.projectId : undefined;

  return { redirectTo, appRedirectTo, source, clientId, codeChallenge, projectId };
}

/**
 * Persists redirect parameters into a cookie.
 */
export function persistPlatformParams(
  req: Request,
  res: Response,
  params: PlatformParams
): void {
  try {
    const serialized = encodeURIComponent(JSON.stringify(params));
    setCookie(res, req, PLATFORM_PARAMS_COOKIE, serialized);
  } catch {
    // ignore serialization issues
  }
}

/**
 * Persists both state and redirect parameters into cookies.
 */
export function persistPlatformContext(
  req: Request,
  res: Response,
  context: { state?: string; params: PlatformParams }
): void {
  persistPlatformParams(req, res, context.params);
  if (context.state) {
    persistStateCookie(req, res, context.state);
  }
}

/**
 * Extracts the core refresh token from cookies.
 */
export const extractRefreshToken = (req: Request): string | undefined =>
  getCookie(req, CORE_REFRESH_TOKEN_COOKIE);

