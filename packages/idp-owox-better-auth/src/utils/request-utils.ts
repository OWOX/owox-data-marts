import { type Request, type Response } from 'express';

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
const REFRESH_TOKEN_COOKIE = 'refreshToken';

export const defaultCookieOptions = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  path: '/' as const,
};

const isLocalhost = (host?: string): boolean =>
  host === 'localhost' || host === '127.0.0.1';

export const isSecureRequest = (req: Request): boolean =>
  req.protocol !== 'http' && !isLocalhost(req.hostname);

export function getCookie(req: Request, name: string): string | undefined {
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
  if (cookies && typeof cookies[name] === 'string') {
    return cookies[name];
  }

  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match && match[1] ? decodeURIComponent(match[1]) : undefined;
}

export function setCookie(
  res: Response,
  req: Request,
  name: string,
  value: string,
  options?: { maxAgeMs?: number }
): void {
  res.cookie(name, value, {
    ...defaultCookieOptions,
    secure: isSecureRequest(req),
    ...(options?.maxAgeMs ? { maxAge: options.maxAgeMs } : {}),
  });
}

export function clearCookie(res: Response, name: string): void {
  res.clearCookie(name, { path: '/' });
}

export function clearPlatformCookies(res: Response): void {
  clearCookie(res, STATE_COOKIE);
  clearCookie(res, PLATFORM_PARAMS_COOKIE);
}

export function persistStateCookie(req: Request, res: Response, state: string): void {
  if (!state) return;
  setCookie(res, req, STATE_COOKIE, state);
}

export function extractState(req: Request): string {
  const stateFromCookie = getCookie(req, STATE_COOKIE);
  if (stateFromCookie) return stateFromCookie;
  const queryState = typeof req.query?.state === 'string' ? req.query.state : '';
  return queryState || '';
}

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

export const extractRefreshToken = (req: Request): string | undefined =>
  getCookie(req, REFRESH_TOKEN_COOKIE);

