import { PlatformParams } from './request-utils.js';
import { tryNormalizeOrigin } from './url-utils.js';

export interface PlatformRedirectOptions {
  baseUrl?: string | null;
  signInUrl?: string | null;
  code: string;
  state: string;
  params?: PlatformParams;
  defaultSource?: string;
  allowedRedirectOrigins?: string[];
}

export interface PlatformEntryOptions {
  authUrl: string;
  params?: PlatformParams;
  defaultSource?: string;
  allowedRedirectOrigins?: string[];
}

function isRelativePath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//');
}

/**
 * Sanitizes redirect parameters to avoid open redirects.
 */
export function sanitizeRedirectParam(
  value: string | undefined,
  allowedRedirectOrigins: string[] | undefined
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (isRelativePath(trimmed)) return trimmed;
  const origin = tryNormalizeOrigin(trimmed);
  if (!origin || !allowedRedirectOrigins?.length) return undefined;
  return allowedRedirectOrigins.includes(origin) ? trimmed : undefined;
}

function applyPlatformParams(
  url: URL,
  params: PlatformParams | undefined,
  options: { defaultSource?: string; allowedRedirectOrigins?: string[] }
): void {
  const source = params?.source || options.defaultSource;
  if (source) url.searchParams.set('source', source);
  const redirectTo = sanitizeRedirectParam(params?.redirectTo, options.allowedRedirectOrigins);
  if (redirectTo) url.searchParams.set('redirect-to', redirectTo);
  const appRedirectTo = sanitizeRedirectParam(
    params?.appRedirectTo,
    options.allowedRedirectOrigins
  );
  if (appRedirectTo) url.searchParams.set('app-redirect-to', appRedirectTo);
  if (params?.clientId) url.searchParams.set('clientId', params.clientId);
  if (params?.codeChallenge) url.searchParams.set('codeChallenge', params.codeChallenge);
  if (params?.projectId) url.searchParams.set('projectId', params.projectId);
}

function resolveBaseUrl(baseUrl?: string | null, signInUrl?: string | null): string | null {
  if (baseUrl) return baseUrl;
  if (!signInUrl) return null;
  try {
    const origin = new URL(signInUrl);
    origin.pathname = '/ui/p/signin';
    origin.search = '';
    return origin.toString();
  } catch {
    return null;
  }
}

/**
 * Builds a Platform redirect URL with code/state and safe params.
 */
export function buildPlatformRedirectUrl(options: PlatformRedirectOptions): URL | null {
  const base = resolveBaseUrl(options.baseUrl, options.signInUrl);
  if (!base) return null;

  const url = new URL(base);
  url.searchParams.set('code', options.code);
  url.searchParams.set('state', options.state);

  applyPlatformParams(url, options.params, {
    defaultSource: options.defaultSource,
    allowedRedirectOrigins: options.allowedRedirectOrigins,
  });

  return url;
}

/**
 * Builds a Platform entry URL (sign-in or sign-up) with safe params.
 */
export function buildPlatformEntryUrl(options: PlatformEntryOptions): URL {
  const url = new URL(options.authUrl);
  applyPlatformParams(url, options.params, {
    defaultSource: options.defaultSource,
    allowedRedirectOrigins: options.allowedRedirectOrigins,
  });
  return url;
}
