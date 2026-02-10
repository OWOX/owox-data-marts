import type { CookieOptions, Request, Response } from 'express';

/** Default cookie path for auth cookies. */
export const COOKIE_DEFAULT_PATH = '/';

const isLocalhost = (host?: string): boolean => host === 'localhost' || host === '127.0.0.1';

/** Determines if a request should use secure cookies. */
export const isSecureRequest = (req: Request): boolean =>
  req.protocol !== 'http' && !isLocalhost(req.hostname);

/** Builds cookie options using consistent security defaults. */
export function buildCookieOptions(req: Request, options?: { maxAgeMs?: number }): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: COOKIE_DEFAULT_PATH,
    secure: isSecureRequest(req),
    ...(options?.maxAgeMs ? { maxAge: options.maxAgeMs } : {}),
  };
}

/** Sets a cookie using shared defaults. */
export function setCookie(
  res: Response,
  req: Request,
  name: string,
  value: string,
  options?: { maxAgeMs?: number }
): void {
  res.cookie(name, value, buildCookieOptions(req, options));
}

/** Clears a cookie, optionally using the same security flags as set. */
export function clearCookie(res: Response, name: string, req?: Request): void {
  if (req) {
    res.clearCookie(name, buildCookieOptions(req));
    return;
  }
  res.clearCookie(name, { path: COOKIE_DEFAULT_PATH });
}
