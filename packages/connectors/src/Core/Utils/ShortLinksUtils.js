/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/* eslint-disable no-unused-vars, no-undef */

//---- processShortLinks -------------------------------------------------
/**
 * Resolves short links nested in an object field and writes the result to `parsed_url` inside it
 *
 * @param {Array} data - Array of data records
 * @param {Object} config - Configuration object
 * @param {string} config.shortLinkField - Field that contains URL objects
 * @param {string} config.urlFieldName - Name of the URL field within the object
 * @param {Array<string>} [config.allowedHosts] - Extra allowed short link domains, added to the built-in services
 * @param {Map<string, string>} [config.resolvedLinksCache] - Original URL to resolved URL. Pass the same Map
 *   across calls to resolve each link once; it is updated in place. Failed resolutions are cached too.
 * @return {Array} Data with processed links
 */
async function processShortLinks(data, { shortLinkField, urlFieldName, allowedHosts = [], resolvedLinksCache = new Map() }) {
  return resolveShortLinkFields(
    data,
    [{ field: shortLinkField, urlKey: urlFieldName, target: 'parsed_url' }],
    { allowedHosts, resolvedLinksCache }
  );
}

//---- resolveShortLinkFields ---------------------------------------------
/**
 * Resolves short links for every field spec and writes results to the spec's target.
 *
 * Spec kinds, detected from the record value:
 * - `urlKey` set: the field is an object holding the URL under `urlKey`; the resolved URL is
 *   written to `field[target]` only when it differs from the original (Facebook `link_url_asset`).
 * - array (or JSON-encoded array) value: `record[target]` gets a same-order array where each
 *   resolved short link replaces the original; other entries copy through.
 * - string value: `record[target]` gets the resolved URL, or the original when it is not a short link.
 *
 * @param {Array} data - Array of data records
 * @param {Array<{field: string, target: string, urlKey?: string}>} specs - Field specs
 * @param {Object} [options]
 * @param {Array<string>} [options.allowedHosts] - Extra allowed short link domains, added to the built-in services
 * @param {Map<string, string>} [options.resolvedLinksCache] - Original URL to resolved URL, updated in place.
 *   A URL that answered without a redirect maps to itself.
 * @param {Set<string>} [options.failedLinks] - Receives URLs whose request failed. They sit in the cache for
 *   the rest of the run, so they are not retried, but must not be persisted across runs.
 * @return {Promise<Array>} Data with resolved links; the same array when there is nothing to do
 */
async function resolveShortLinkFields(data, specs, { allowedHosts = [], resolvedLinksCache = new Map(), failedLinks = new Set() } = {}) {
  if (!Array.isArray(data) || data.length === 0 || !Array.isArray(specs) || specs.length === 0) return data;

  const candidates = _collectCandidateUrls(data, specs, allowedHosts);
  const hasPlainTargets = specs.some(spec => !spec.urlKey);
  if (candidates.length === 0 && !hasPlainTargets) return data;

  const uncachedLinks = candidates.filter(url => !resolvedLinksCache.has(url)).map(originalUrl => ({ originalUrl }));
  const freshlyResolved = await _resolveShortLinks(uncachedLinks, allowedHosts);
  freshlyResolved.forEach(link => {
    resolvedLinksCache.set(link.originalUrl, link.resolvedUrl);
    if (!link.ok) failedLinks.add(link.originalUrl);
  });

  // Only today's allowlisted candidates take a cached answer: the cache is seeded from saved
  // state, which may hold links on domains that are no longer (or were never) allowlisted.
  const resolvable = new Set(candidates);
  return data.map(record =>
    specs.reduce((current, spec) => _applySpec(current, spec, resolvedLinksCache, resolvable), record)
  );
}

//---- _collectCandidateUrls ----------------------------------------------
/**
 * Collects unique potential short links across all specs and records
 *
 * @param {Array} data - Data records
 * @param {Array} specs - Field specs
 * @param {Array<string>} allowedHosts - Extra allowed short link domains, added to the built-in services
 * @return {Array<string>} Unique URLs worth resolving
 * @private
 */
function _collectCandidateUrls(data, specs, allowedHosts) {
  const unique = new Set();
  data.forEach(record => {
    specs.forEach(spec => {
      _readUrls(record[spec.field], spec).forEach(url => {
        if (_isPotentialShortLink(url, allowedHosts)) unique.add(url);
      });
    });
  });
  return Array.from(unique);
}

//---- _readUrls ----------------------------------------------------------
/**
 * Extracts the URL strings a field value holds, for any spec kind
 *
 * @param {*} value - Field value
 * @param {{urlKey?: string}} spec - Field spec
 * @return {Array<string>} URLs found (may be empty)
 * @private
 */
function _readUrls(value, spec) {
  if (value === null || value === undefined) return [];
  if (spec.urlKey) return typeof value === 'object' && typeof value[spec.urlKey] === 'string' ? [value[spec.urlKey]] : [];
  const array = _asArray(value);
  if (array) return array.filter(item => typeof item === 'string');
  return typeof value === 'string' ? [value] : [];
}

//---- _asArray -----------------------------------------------------------
/**
 * Returns the array a value represents: a real array, or a JSON-encoded array string
 *
 * @param {*} value - Field value
 * @return {Array|null} The array, or null when the value is not an array
 * @private
 */
function _asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_error) {
      return null;
    }
  }
  return null;
}

//---- _applySpec ---------------------------------------------------------
/**
 * Returns a copy of the record with one spec's target filled in
 *
 * @param {Object} record - Data record
 * @param {{field: string, target: string, urlKey?: string}} spec - Field spec
 * @param {Map<string, string>} cache - Original URL to resolved URL
 * @param {Set<string>} resolvable - URLs allowed to take a cached answer in this call
 * @return {Object} New record, or the same record when nothing changes
 * @private
 */
function _applySpec(record, spec, cache, resolvable) {
  const value = record[spec.field];
  const resolve = url => (typeof url === 'string' && resolvable.has(url) && cache.has(url) ? cache.get(url) : url);

  if (spec.urlKey) {
    const original = value && value[spec.urlKey];
    const resolved = resolve(original);
    if (!original || resolved === original) return record;
    return { ...record, [spec.field]: { ...value, [spec.target]: resolved } };
  }

  if (value === null || value === undefined) return { ...record, [spec.target]: null };

  const array = _asArray(value);
  if (array) {
    const resolvedArray = array.map(resolve);
    return { ...record, [spec.target]: typeof value === 'string' ? JSON.stringify(resolvedArray) : resolvedArray };
  }

  return { ...record, [spec.target]: resolve(value) };
}

//---- omitShortLinkTargets -----------------------------------------------
/**
 * Removes the `_parsed` target names of a schema node from a field list before a vendor request,
 * so connector-only columns are never sent to the API
 *
 * @param {Object} node - Fields schema node (may carry `shortLinks`)
 * @param {Array<string>} fields - Selected field names
 * @return {Array<string>} Fields without short link targets
 */
function omitShortLinkTargets(node, fields) {
  const targets = new Set((node?.shortLinks || []).filter(spec => !spec.urlKey).map(spec => spec.target));
  return targets.size === 0 ? fields : fields.filter(field => !targets.has(field));
}

//---- getShortLinkDomainsFromEnv -----------------------------------------
const SHORT_LINK_DOMAINS_ENV = 'CONNECTOR_SHORT_LINK_DOMAINS';

/**
 * Reads the deployment-wide list of additional allowed short link domains
 *
 * @param {Object} [env] - Environment map; defaults to process.env
 * @return {Array<string>} Lower-cased domains, empty when the variable is unset
 */
function getShortLinkDomainsFromEnv(env = typeof process !== 'undefined' ? process.env : {}) {
  return parseShortLinkDomains(env[SHORT_LINK_DOMAINS_ENV]);
}

//---- parseShortLinkDomains ----------------------------------------------
/**
 * Parses a comma, semicolon or whitespace separated list of domains.
 * Accepts bare domains as well as full URLs; scheme, a leading `*.` or `.`, port, path and
 * trailing dot are stripped.
 * Entries without a dot (bare TLDs, localhost) and IPv4 addresses are ignored; Unicode
 * domains are stored in punycode, the form URL.hostname uses.
 *
 * @param {string|undefined} value - Raw list
 * @return {Array<string>} Lower-cased ASCII domains
 */
function parseShortLinkDomains(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;\s]+/)
    .map(entry => entry.replace(/^[a-z]+:\/\//i, '').replace(/^\*?\./, '').split('/')[0].split(':')[0].replace(/\.$/, '').trim().toLowerCase())
    .map(_toAsciiHost)
    // Domains only: an IP literal is no short link service and would match by suffix
    .filter(host => host.includes('.') && !/^\d+(\.\d+){3}$/.test(host));
}

//---- _toAsciiHost -------------------------------------------------------
/**
 * Converts a hostname to the ASCII (punycode) form that URL.hostname uses, so Unicode entries
 * can match. Returns an empty string for a value that is not a valid hostname.
 *
 * @param {string} host - Hostname
 * @return {string} ASCII hostname, or '' when invalid
 * @private
 */
function _toAsciiHost(host) {
  if (!host) return '';
  try {
    return new URL(`https://${host}`).hostname;
  } catch (_error) {
    return '';
  }
}

//---- short links state (persisted per data mart across runs) ------------
const SHORT_LINKS_STATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// The state travels back to the connector inside the OW_RUN_CONFIG environment variable. Windows caps
// one variable at 32,767 characters, so the serialized cache stays well under that with room for the
// rest of the run config. This size budget is the only bound on the number of entries.
const SHORT_LINKS_STATE_MAX_BYTES = 24 * 1024;

/**
 * Loads persisted resolutions, dropping malformed and expired entries.
 * An entry is `[resolvedUrl, resolvedAtMs]`, or `[null, resolvedAtMs]` for a URL that answered
 * without a redirect (it resolves to itself).
 *
 * @param {Object|undefined} raw - `{ [originalUrl]: [resolvedUrl | null, resolvedAtMs] }` from connector state
 * @param {number} [now] - Current time in ms
 * @return {Map<string, {url: string, at: number}>} Usable entries
 */
function loadShortLinksState(raw, now = Date.now()) {
  const entries = new Map();
  if (!raw || typeof raw !== 'object') return entries;
  Object.entries(raw).forEach(([original, value]) => {
    if (!Array.isArray(value)) return;
    const [url, at] = value;
    if ((url !== null && typeof url !== 'string') || typeof at !== 'number' || now - at > SHORT_LINKS_STATE_TTL_MS) return;
    entries.set(original, { url: url === null ? original : url, at });
  });
  return entries;
}

/**
 * Builds the object to persist: answered resolutions, newest first, as many as fit the size budget.
 * The caller leaves out failed requests. A URL that did not redirect is stored as `[null, at]`,
 * so landing pages are not requested again on every run and cost little of the budget.
 *
 * @param {Map<string, {url: string, at: number}>} entries - Original URL to resolution
 * @param {number} [now] - Current time in ms
 * @return {Object} `{ [originalUrl]: [resolvedUrl | null, resolvedAtMs] }`
 */
function buildShortLinksState(entries, now = Date.now()) {
  const newestFirst = Array.from(entries.entries())
    .filter(([, { at }]) => now - at <= SHORT_LINKS_STATE_TTL_MS)
    .sort((a, b) => b[1].at - a[1].at);

  // Fill the budget entry by entry: `{` + `"key":value` pairs joined by `,` + `}`
  const state = {};
  let size = 2;
  for (const [original, { url, at }] of newestFirst) {
    const value = [url === original ? null : url, at];
    const entrySize = JSON.stringify(original).length + 1 + JSON.stringify(value).length + (size > 2 ? 1 : 0);
    if (size + entrySize > SHORT_LINKS_STATE_MAX_BYTES) break;
    state[original] = value;
    size += entrySize;
  }
  return state;
}

// Links carrying UTM tags anywhere (query or fragment) already point at the landing page
const UTM_PARAM_PATTERN = /utm_(source|medium|campaign|term|content)/;

// Well-known public URL shortener services, resolved without any configuration.
// Deployment-specific services are added through CONNECTOR_SHORT_LINK_DOMAINS.
const KNOWN_SHORT_LINK_DOMAINS = [
  'bit.ly',
  'tinyurl.com',
  't.co',
  'lnkd.in',
  'youtu.be',
  'amzn.to',
  'ow.ly',
  'buff.ly',
  'cutt.ly',
  'is.gd',
  'rebrand.ly'
];

//---- _isPotentialShortLink ----------------------------------------------
/**
 * Determines whether a URL is a short link worth resolving.
 * Only links on allowlisted domains qualify: the built-in services above plus the
 * deployment's configured domains. Everything else is treated as a landing page.
 *
 * @param {string} url - URL to check
 * @param {Array<string>} allowedHosts - Extra allowed short link domains, added to the built-in services
 * @return {boolean} True if the link should be resolved
 * @private
 */
function _isPotentialShortLink(url, allowedHosts) {
  if (!url || typeof url !== 'string') return false;

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== 'https:' || url.includes('?') || UTM_PARAM_PATTERN.test(url)) {
      return false;
    }

    if (!_isAllowedShortLinkHost(parsedUrl.hostname, allowedHosts)) return false;

    // Rejects a bare root ([''] fails every) and empty segments from double slashes
    const pathSegments = _getPathSegments(parsedUrl.pathname);
    return pathSegments.every(Boolean);
  } catch (_error) {
    return false;
  }
}

//---- _getPathSegments ---------------------------------------------------
/**
 * Splits a pathname into segments. One trailing slash is tolerated; empty segments
 * elsewhere (a bare root, a double slash) are kept so callers can reject them.
 *
 * @param {string} pathname - URL pathname
 * @return {Array<string>} Path segments
 * @private
 */
function _getPathSegments(pathname) {
  const segments = pathname.slice(1).split('/');
  const hasTrailingSlash = segments.length > 1 && segments[segments.length - 1] === '';
  return hasTrailingSlash ? segments.slice(0, -1) : segments;
}

//---- _isAllowedShortLinkHost --------------------------------------------
/**
 * Checks whether a hostname equals or is a subdomain of an allowlisted short link domain
 *
 * @param {string} hostname - Hostname to check
 * @param {Array<string>} allowedHosts - Extra allowed domains beyond the built-in services
 * @return {boolean} True if the hostname is allowlisted
 * @private
 */
function _isAllowedShortLinkHost(hostname, allowedHosts) {
  const isMatch = host => hostname === host || hostname.endsWith(`.${host}`);
  return KNOWN_SHORT_LINK_DOMAINS.some(isMatch) || allowedHosts.some(isMatch);
}

//---- _resolveShortLinks -------------------------------------------------
const SHORT_LINK_FETCH_TIMEOUT_MS = 10000;
const SHORT_LINK_MAX_REDIRECTS = 20;
const SHORT_LINK_CONCURRENCY = 10;

/**
 * Resolves short links to their full URLs, a bounded number at a time
 *
 * @param {Array} shortLinks - Array of short link objects
 * @param {Array<string>} allowedHosts - Extra allowed short link domains, added to the built-in services
 * @return {Promise<Array<{originalUrl: string, resolvedUrl: string, ok: boolean}>>} Resolution results
 * @private
 */
async function _resolveShortLinks(shortLinks, allowedHosts = []) {
  const results = [];
  for (let i = 0; i < shortLinks.length; i += SHORT_LINK_CONCURRENCY) {
    const batch = shortLinks.slice(i, i + SHORT_LINK_CONCURRENCY);
    results.push(...(await Promise.all(batch.map(link => _resolveShortLink(link, allowedHosts)))));
  }
  return results;
}

//---- _resolveShortLink --------------------------------------------------
/**
 * Resolves one short link; on any failure the original URL is kept.
 * `ok` tells an answered request (redirected or not) apart from a failed one: only answered
 * results are worth remembering across runs, a failure should be retried next run.
 *
 * @param {{originalUrl: string}} linkObj - Short link object
 * @param {Array<string>} allowedHosts - Extra allowed short link domains, added to the built-in services
 * @return {Promise<{originalUrl: string, resolvedUrl: string, ok: boolean}>} Resolution result
 * @private
 */
async function _resolveShortLink(linkObj, allowedHosts = []) {
  const originalUrl = linkObj.originalUrl;
  try {
    return { originalUrl, resolvedUrl: await _followRedirects(originalUrl, allowedHosts), ok: true };
  } catch (error) {
    // stdout, as on main: the host treats any raw stderr line as a run failure, and a
    // link that cannot be resolved only keeps its original URL.
    console.log(`Failed to resolve short link ${_describeUrl(originalUrl)}: ${error.message}`);
    // A refused hop (here or in SsrfGuard) is decided by the URL and its DNS answer alone and
    // would be refused again, so it counts as answered (cached) instead of failed (retried).
    return { originalUrl, resolvedUrl: originalUrl, ok: Boolean(error.isRefusal) };
  }
}

//---- _describeUrl -------------------------------------------------------
/**
 * Safe form of a URL for logs: origin and path only. stdout is the connector's message channel,
 * so a raw value must never be printed: it may carry line breaks or credentials in userinfo.
 *
 * @param {string} url - URL to describe
 * @return {string} `origin + pathname`, or a placeholder when the value does not parse
 * @private
 */
function _describeUrl(url) {
  try {
    const { origin, pathname } = new URL(url);
    return `${origin}${pathname}`;
  } catch (_error) {
    return '[unparseable URL]';
  }
}

//---- _followRedirects ---------------------------------------------------
// A short link service answering with one of these is overloaded or down, not answering for the
// link: treat it as a failed request so the next run retries, instead of caching "no redirect".
// 404 and 410 stay answers, since a deleted short link stays deleted.
const SHORT_LINK_TRANSIENT_STATUS = status => status === 408 || status === 429 || status >= 500;

/**
 * Follows HTTP redirects manually, checking every hop before it is requested. Only allowlisted
 * short link services are ever requested: the first hop that leaves the allowlist is returned as
 * the result without being requested, so the connector never contacts a landing site.
 *
 * @param {string} startUrl - URL to start from (an allowlisted short link)
 * @param {Array<string>} allowedHosts - Extra allowed short link domains, added to the built-in services
 * @return {Promise<string>} The address the short link service points to
 * @private
 */
async function _followRedirects(startUrl, allowedHosts = []) {
  let currentUrl = startUrl;
  for (let hop = 0; hop <= SHORT_LINK_MAX_REDIRECTS; hop++) {
    if (!_isPublicHttpUrl(currentUrl)) {
      const refusal = new Error(`Refusing non-public URL ${_describeUrl(currentUrl)}`);
      refusal.isRefusal = true;
      throw refusal;
    }
    if (hop > 0 && !_isAllowedShortLinkHost(new URL(currentUrl).hostname, allowedHosts)) {
      return currentUrl;
    }
    // Before every request: https only, and no allowlisted name may resolve to a private,
    // loopback or link-local address. SsrfGuard is a bare global of the bundle's Core scope.
    await new SsrfGuard([]).assertPublicHttps(currentUrl);
    // Native fetch: Node returns the 3xx itself under `redirect: 'manual'`, with a
    // readable status and Location, so each hop can be vetted before it is followed.
    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(SHORT_LINK_FETCH_TIMEOUT_MS)
    });
    // Only the status and Location are read; release the connection instead of waiting for GC
    await response.body?.cancel().catch(() => {});
    if (SHORT_LINK_TRANSIENT_STATUS(response.status)) {
      throw new Error(`Short link service answered ${response.status}`);
    }
    const location = _getRedirectLocation(response);
    if (!location) return currentUrl;
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error(`Too many redirects (limit ${SHORT_LINK_MAX_REDIRECTS})`);
}

//---- _getRedirectLocation -----------------------------------------------
/**
 * Returns the Location header of a redirect response, or null for a final response
 *
 * @param {Response} response - Native fetch Response
 * @return {string|null} Redirect target or null
 * @private
 */
function _getRedirectLocation(response) {
  const status = response.status;
  if (status < 300 || status > 399) return null;
  return response.headers.get('location');
}

//---- _isPublicHttpUrl ---------------------------------------------------
/**
 * Accepts only http(s) URLs whose host is not a loopback, private, link-local or internal address
 *
 * @param {string} url - URL to check
 * @return {boolean} True if the URL may be requested
 * @private
 */
function _isPublicHttpUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || /\.(localhost|internal|local)$/.test(host)) return false;
    return !_isPrivateIp(host);
  } catch (_error) {
    return false;
  }
}

//---- _isPrivateIp -------------------------------------------------------
/**
 * Detects loopback, private, link-local, carrier-grade NAT, multicast and IPv6 local literals
 *
 * @param {string} host - Lower-cased hostname without brackets
 * @return {boolean} True if the host is an IP literal in a non-public range
 * @private
 */
function _isPrivateIp(host) {
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (host.includes(':')) {
    return host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:');
  }
  return false;
}
