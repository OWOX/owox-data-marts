export const MAX_PLUGIN_ROUTE_LENGTH = 2048;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const INVISIBLE_CHARACTER = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;
const CAMPAIGN_TAG = /^utm_/i;
/** `.` and `..`, literal or percent-encoded in any case: the URL parser collapses all of them. */
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;
/** Cheap bound before resolving: worst case is 9 encoded chars per raw UTF-8 byte-heavy character. */
const MAX_RAW_PLUGIN_ROUTE_LENGTH = MAX_PLUGIN_ROUTE_LENGTH * 9;
const PROBE_ORIGIN = 'https://route.invalid';
const PROBE_BASE = '/open';

export function normalizePluginRoute(route: unknown): string | null {
  if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//')) {
    return null;
  }
  // The URL parser trims a trailing space off the whole input, which can unmask a '..' segment.
  if (
    route.endsWith(' ') ||
    route.length > MAX_RAW_PLUGIN_ROUTE_LENGTH ||
    CONTROL_CHARACTER.test(route) ||
    INVISIBLE_CHARACTER.test(route)
  ) {
    return null;
  }
  if (route.includes('\\') || /%5c/i.test(route)) {
    return null;
  }

  const path = route.split(/[?#]/, 1)[0];
  if (path.split('/').some(segment => DOT_SEGMENT.test(segment))) {
    return null;
  }

  try {
    const resolved = new URL(`${PROBE_BASE}${route}`, PROBE_ORIGIN);
    if (resolved.pathname !== PROBE_BASE && !resolved.pathname.startsWith(`${PROBE_BASE}/`)) {
      return null;
    }
    const canonical = `${resolved.pathname.slice(PROBE_BASE.length)}${resolved.search}${resolved.hash}`;
    return canonical.length <= MAX_PLUGIN_ROUTE_LENGTH ? canonical : null;
  } catch {
    return null;
  }
}

export function isValidPluginRoute(route: unknown): route is string {
  return normalizePluginRoute(route) !== null;
}

export function canonicalPluginRoute(route: unknown): string | null {
  const normalized = normalizePluginRoute(route);
  if (normalized === null) {
    return null;
  }
  const { pathname, search, hash } = new URL(normalized, PROBE_ORIGIN);
  return `${pathname}${withoutCampaignTags(search)}${hash}`;
}

export function routeFromLocation(
  location: { pathname: string; search: string; hash: string },
  openBase: string
): string {
  const { pathname, search, hash } = location;
  if (pathname !== openBase && !pathname.startsWith(`${openBase}/`)) {
    return '/';
  }

  const route = `${pathname.slice(openBase.length) || '/'}${withoutCampaignTags(search)}${hash}`;
  return normalizePluginRoute(route) ?? '/';
}

/** Drops `utm_*` parameters and leaves every other pair, its order and its encoding as it was. */
function withoutCampaignTags(search: string): string {
  if (search.length <= 1) {
    return search;
  }
  const kept = search
    .slice(1)
    .split('&')
    .filter(pair => !CAMPAIGN_TAG.test(pair));
  return kept.length > 0 ? `?${kept.join('&')}` : '';
}

export function appendRoute(openBase: string, route: string): string {
  return route === '/' ? openBase : `${openBase}${route}`;
}
