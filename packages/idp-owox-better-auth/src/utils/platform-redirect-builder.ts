import { PlatformParams } from './request-utils.js';

export interface PlatformRedirectOptions {
  baseUrl?: string | null;
  signInUrl?: string | null;
  code: string;
  state: string;
  params?: PlatformParams;
  defaultSource?: string;
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

export function buildPlatformRedirectUrl(options: PlatformRedirectOptions): URL | null {
  const base = resolveBaseUrl(options.baseUrl, options.signInUrl);
  if (!base) return null;

  const url = new URL(base);
  const { params } = options;
  url.searchParams.set('code', options.code);
  url.searchParams.set('state', options.state);

  if (params?.redirectTo) url.searchParams.set('redirect-to', params.redirectTo);
  if (params?.appRedirectTo) url.searchParams.set('app-redirect-to', params.appRedirectTo);
  const source = params?.source || options.defaultSource;
  if (source) url.searchParams.set('source', source);
  if (params?.clientId) url.searchParams.set('clientId', params.clientId);
  if (params?.codeChallenge) url.searchParams.set('codeChallenge', params.codeChallenge);
  if (params?.projectId) url.searchParams.set('projectId', params.projectId);

  return url;
}
