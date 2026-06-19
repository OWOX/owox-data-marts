import { type Request, type Response } from 'express';
import { z } from 'zod';
import {
  BETTER_AUTH_CSRF_COOKIE,
  BETTER_AUTH_SESSION_COOKIE,
  BETTER_AUTH_STATE_COOKIE,
  CORE_REFRESH_TOKEN_COOKIE,
} from '../core/constants.js';
import { clearCookie, setCookie } from './cookie-policy.js';
export { setCookie } from './cookie-policy.js';

const AUTH_PARAMS = new Set([
  'state',
  'code',
  'source',
  'app-redirect-to',
  'appRedirectTo',
  'redirect',
  'redirect-to',
  'redirectTo',
  'clientId',
  'codeChallenge',
  'codechallenge',
  'projectId',
  'error',
  'info',
  'token',
  'callbackURL',
  'intent',
]);

const STATE_COOKIE = 'idp-owox-state';
const AUTH_FLOW_PARAMS_COOKIE = 'idp-owox-params';
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const optionalStringParam = z.preprocess(
  value => (typeof value === 'string' ? value : undefined),
  z.string().optional()
);

const optionalProjectIdParam = z.preprocess(
  value => (typeof value === 'string' && PROJECT_ID_PATTERN.test(value) ? value : undefined),
  z.string().optional()
);

const optionalExtraParams = z.preprocess(value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const extraParams = Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
  return Object.keys(extraParams).length > 0 ? extraParams : undefined;
}, z.record(z.string()).optional());

/**
 * Parameters used for auth-flow redirects and context persistence.
 */
export const AuthFlowParamsSchema = z.object({
  redirectTo: optionalStringParam,
  appRedirectTo: optionalStringParam,
  source: optionalStringParam,
  clientId: optionalStringParam,
  codeChallenge: optionalStringParam,
  projectId: optionalProjectIdParam,
  extraParams: optionalExtraParams,
});

export type AuthFlowParams = z.infer<typeof AuthFlowParamsSchema>;

export function parseAuthFlowParams(value: unknown): AuthFlowParams | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const result = AuthFlowParamsSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseSerializedAuthFlowParams(value: unknown): AuthFlowParams | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  const candidates = [value];
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value) {
      candidates.push(decoded);
    }
  } catch {
    // ignore malformed URI encoding
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const params = parseAuthFlowParams(parsed);
      if (params) {
        return params;
      }
    } catch {
      // try next candidate
    }
  }

  return undefined;
}

export function serializeAuthFlowParams(params?: AuthFlowParams): string | null {
  const parsed = parseAuthFlowParams(params);
  if (!parsed) return null;

  const serialized = JSON.stringify(parsed);
  return serialized === '{}' ? null : serialized;
}

function normalizeProjectId(value: string | undefined): string | undefined {
  return value && PROJECT_ID_PATTERN.test(value) ? value : undefined;
}

/**
 * Centralized state handling with single-source validation.
 */
export class StateManager {
  private readonly stateFromCookie: string | undefined;
  private readonly queryState: string;

  constructor(private readonly req: Request) {
    this.stateFromCookie = getCookie(req, STATE_COOKIE);
    this.queryState = typeof req.query?.state === 'string' ? req.query.state : '';
  }

  extract(): string {
    if (this.hasMismatch()) {
      return '';
    }
    return this.stateFromCookie || this.queryState || '';
  }

  extractFromCookie(): string {
    return this.stateFromCookie || '';
  }

  hasMismatch(): boolean {
    return Boolean(
      this.stateFromCookie && this.queryState && this.stateFromCookie !== this.queryState
    );
  }

  persist(res: Response, state: string): void {
    if (!state) return;
    setCookie(res, this.req, STATE_COOKIE, state);
  }
}

declare module 'express' {
  interface Request {
    _stateManager?: StateManager;
  }
}

/**
 * Returns a cached StateManager instance for the request.
 */
export function getStateManager(req: Request): StateManager {
  if (!req._stateManager) {
    req._stateManager = new StateManager(req);
  }
  return req._stateManager;
}

/**
 * Reads a cookie value from request headers or cookie parser.
 */
export function getCookie(req: Request, name: string): string | undefined {
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
  if (cookies && typeof cookies[name] === 'string') {
    return cookies[name];
  }

  const cookieHeader = req.headers.cookie || '';
  if (!cookieHeader) return undefined;

  const escapedName = encodeURIComponent(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`));
  if (!match || !match[1]) return undefined;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Reads a single query string value by key.
 * Returns the first item when query param is an array.
 */
export function readQueryString(req: Request, key: string): string | undefined {
  const rawValue = req.query?.[key];
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Clears auth-flow cookies (state and params).
 */
export function clearAuthFlowCookies(res: Response, req?: Request): void {
  clearCookie(res, STATE_COOKIE, req);
  clearCookie(res, AUTH_FLOW_PARAMS_COOKIE, req);
}

/**
 * Clears only the auth-flow PKCE state cookie.
 */
export function clearAuthFlowStateCookie(res: Response, req?: Request): void {
  clearCookie(res, STATE_COOKIE, req);
}

/**
 * Clears Better Auth session and CSRF cookies.
 */
export function clearBetterAuthCookies(res: Response, req?: Request): void {
  const cookieNames = [
    BETTER_AUTH_SESSION_COOKIE,
    BETTER_AUTH_CSRF_COOKIE,
    BETTER_AUTH_STATE_COOKIE,
  ];
  const allCookieVariants = cookieNames.flatMap(name => [
    name,
    `__Secure-${name}`,
    `__Host-${name}`,
  ]);
  const uniqueCookieVariants = Array.from(new Set(allCookieVariants));
  for (const cookieName of uniqueCookieVariants) {
    clearCookie(res, cookieName, req);
  }
}

/**
 * Clears all auth-related cookies (Platform + Better Auth).
 */
export function clearAllAuthCookies(res: Response, req?: Request): void {
  clearAuthFlowCookies(res, req);
  clearBetterAuthCookies(res, req);
}

/**
 * Persists the PKCE state into a cookie.
 */
export function persistStateCookie(req: Request, res: Response, state: string): void {
  getStateManager(req).persist(res, state);
}

/**
 * Extracts state from cookie or query, with mismatch protection.
 */
export function extractState(req: Request): string {
  return getStateManager(req).extract();
}

/**
 * Extracts state only from the cookie.
 */
export function extractStateFromCookie(req: Request): string {
  return getStateManager(req).extractFromCookie();
}

/**
 * Returns true when cookie state and query state mismatch.
 */
export function hasStateMismatch(req: Request): boolean {
  return getStateManager(req).hasMismatch();
}

/**
 * Extracts redirect parameters from cookie or query.
 */
export function extractAuthFlowParams(req: Request): AuthFlowParams {
  const extraParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (!AUTH_PARAMS.has(key) && typeof value === 'string') {
      extraParams[key] = value;
    }
  }
  const resolvedExtraParams = Object.keys(extraParams).length > 0 ? extraParams : undefined;

  let cookieParams: AuthFlowParams = {};
  const cookiePayload = getCookie(req, AUTH_FLOW_PARAMS_COOKIE);
  cookieParams = parseSerializedAuthFlowParams(cookiePayload) ?? {};

  const redirectTo =
    (typeof req.query?.['redirect-to'] === 'string' && req.query['redirect-to']) ||
    (typeof req.query?.redirectTo === 'string' && req.query.redirectTo) ||
    (typeof req.query?.redirect === 'string' && req.query.redirect) ||
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
  const projectId = normalizeProjectId(
    typeof req.query?.projectId === 'string' ? req.query.projectId : undefined
  );

  return {
    redirectTo: redirectTo || cookieParams.redirectTo,
    appRedirectTo: appRedirectTo || cookieParams.appRedirectTo,
    source: source || cookieParams.source,
    clientId: clientId || cookieParams.clientId,
    codeChallenge: codeChallenge || cookieParams.codeChallenge,
    projectId: projectId || cookieParams.projectId,
    extraParams: resolvedExtraParams || cookieParams.extraParams,
  };
}

/**
 * Persists redirect parameters into a cookie.
 */
export function persistAuthFlowParams(req: Request, res: Response, params: AuthFlowParams): void {
  try {
    const serializedParams = serializeAuthFlowParams(params);
    if (!serializedParams) return;
    const serialized = encodeURIComponent(serializedParams);
    setCookie(res, req, AUTH_FLOW_PARAMS_COOKIE, serialized);
  } catch {
    // ignore serialization issues
  }
}

/**
 * Persists both state and redirect parameters into cookies.
 */
export function persistAuthFlowContext(
  req: Request,
  res: Response,
  context: { state?: string; params: AuthFlowParams }
): void {
  persistAuthFlowParams(req, res, context.params);
  if (context.state) {
    persistStateCookie(req, res, context.state);
  }
}

/**
 * Extracts the core refresh token from cookies.
 */
export const extractRefreshToken = (req: Request): string | undefined =>
  getCookie(req, CORE_REFRESH_TOKEN_COOKIE);
