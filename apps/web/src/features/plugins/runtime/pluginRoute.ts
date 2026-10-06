export const MAX_PLUGIN_ROUTE_LENGTH = 2048;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
/** Bidi controls, zero-width and other invisible formatting characters. */
const FORMAT_CHARACTER = /[\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;
const CAMPAIGN_TAG = /^utm_/i;
/** `.` and `..`, literal or percent-encoded in any case: the URL parser collapses all of them. */
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;
/** Caps parser work only: percent-encoding lengthens a route, so the encoded limit below decides. */
const MAX_RAW_PLUGIN_ROUTE_LENGTH = MAX_PLUGIN_ROUTE_LENGTH * 9;
const PROBE_ORIGIN = 'https://route.invalid';
const PROBE_BASE = '/open';

export function normalizePluginRoute(route: unknown): string | null {
  if (
    typeof route !== 'string' ||
    !route.startsWith('/') ||
    route.length > MAX_RAW_PLUGIN_ROUTE_LENGTH ||
    CONTROL_CHARACTER.test(route) ||
    FORMAT_CHARACTER.test(route)
  ) {
    return null;
  }

  const path = route.split(/[?#]/, 1)[0];
  // A trailing space would be trimmed off, unmasking a '..'; React Router collapses an empty segment.
  if (
    path.endsWith(' ') ||
    path.includes('//') ||
    path.includes('\\') ||
    /%5c/i.test(path) ||
    path.split('/').some(segment => DOT_SEGMENT.test(segment))
  ) {
    return null;
  }
  // The parser keeps a backslash and trims trailing spaces in a query or hash; encode both instead.
  const rest = route
    .slice(path.length)
    .replace(/\\/g, '%5C')
    .replace(/ +$/, spaces => '%20'.repeat(spaces.length));

  try {
    const resolved = new URL(`${PROBE_BASE}${path}${rest}`, PROBE_ORIGIN);
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
