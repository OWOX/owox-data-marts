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
 * @param {Array<string>} [config.nestedPathHosts] - Short-link domains whose links may contain nested paths
 * @param {Map<string, string>} [config.resolvedLinksCache] - Original URL to resolved URL. Pass the same Map
 *   across calls to resolve each link once; it is updated in place. Failed resolutions are cached too.
 * @return {Array} Data with processed links
 */
async function processShortLinks(data, { shortLinkField, urlFieldName, nestedPathHosts = [], resolvedLinksCache = new Map() }) {
  return resolveShortLinkFields(
    data,
    [{ field: shortLinkField, urlKey: urlFieldName, target: 'parsed_url' }],
    { nestedPathHosts, resolvedLinksCache }
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
 * @param {Array<string>} [options.nestedPathHosts] - Short-link domains whose links may contain nested paths
 * @param {Map<string, string>} [options.resolvedLinksCache] - Original URL to resolved URL, updated in place
 * @return {Promise<Array>} Data with resolved links; the same array when there is nothing to do
 */
async function resolveShortLinkFields(data, specs, { nestedPathHosts = [], resolvedLinksCache = new Map() } = {}) {
  if (!Array.isArray(data) || data.length === 0 || !Array.isArray(specs) || specs.length === 0) return data;

  const candidates = _collectCandidateUrls(data, specs, nestedPathHosts);
  const hasPlainTargets = specs.some(spec => !spec.urlKey);
  if (candidates.length === 0 && !hasPlainTargets) return data;

  const uncachedLinks = candidates.filter(url => !resolvedLinksCache.has(url)).map(originalUrl => ({ originalUrl }));
  const freshlyResolved = await _resolveShortLinks(uncachedLinks);
  freshlyResolved.forEach(link => resolvedLinksCache.set(link.originalUrl, link.resolvedUrl));

  return data.map(record => specs.reduce((current, spec) => _applySpec(current, spec, resolvedLinksCache), record));
}

//---- _collectCandidateUrls ----------------------------------------------
/**
 * Collects unique potential short links across all specs and records
 *
 * @param {Array} data - Data records
 * @param {Array} specs - Field specs
 * @param {Array<string>} nestedPathHosts - Short-link domains whose links may contain nested paths
 * @return {Array<string>} Unique URLs worth resolving
 * @private
 */
function _collectCandidateUrls(data, specs, nestedPathHosts) {
  const unique = new Set();
  data.forEach(record => {
    specs.forEach(spec => {
      _readUrls(record[spec.field], spec).forEach(url => {
        if (_isPotentialShortLink(url, nestedPathHosts)) unique.add(url);
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
 * @return {Object} New record, or the same record when nothing changes
 * @private
 */
function _applySpec(record, spec, cache) {
  const value = record[spec.field];
  const resolve = url => (typeof url === 'string' && cache.has(url) ? cache.get(url) : url);

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
 * Reads the deployment-wide list of short link domains whose links contain nested paths
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
 * Accepts bare domains as well as full URLs; scheme, port, path and trailing dot are stripped.
 * Entries without a dot (bare TLDs, localhost) are ignored.
 *
 * @param {string|undefined} value - Raw list
 * @return {Array<string>} Lower-cased domains
 */
function parseShortLinkDomains(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;\s]+/)
    .map(entry => entry.replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0].replace(/\.$/, '').trim().toLowerCase())
    .filter(host => host.includes('.'));
}

//---- short links state (persisted per data mart across runs) ------------
const SHORT_LINKS_STATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SHORT_LINKS_STATE_MAX_ENTRIES = 200;
// The state travels back to the connector inside the OW_RUN_CONFIG environment variable. Windows caps
// one variable at 32,767 characters, so the serialized cache stays well under that with room for the
// rest of the run config.
const SHORT_LINKS_STATE_MAX_BYTES = 24 * 1024;

/**
 * Loads persisted resolutions, dropping malformed and expired entries
 *
 * @param {Object|undefined} raw - `{ [originalUrl]: [resolvedUrl, resolvedAtMs] }` from connector state
 * @param {number} [now] - Current time in ms
 * @return {Map<string, {url: string, at: number}>} Usable entries
 */
function loadShortLinksState(raw, now = Date.now()) {
  const entries = new Map();
  if (!raw || typeof raw !== 'object') return entries;
  Object.entries(raw).forEach(([original, value]) => {
    if (!Array.isArray(value)) return;
    const [url, at] = value;
    if (typeof url !== 'string' || typeof at !== 'number' || now - at > SHORT_LINKS_STATE_TTL_MS) return;
    entries.set(original, { url, at });
  });
  return entries;
}

/**
 * Builds the object to persist: successful resolutions only, newest first, bounded in count and size
 *
 * @param {Map<string, {url: string, at: number}>} entries - Original URL to resolution
 * @param {number} [now] - Current time in ms
 * @return {Object} `{ [originalUrl]: [resolvedUrl, resolvedAtMs] }`
 */
function buildShortLinksState(entries, now = Date.now()) {
  const kept = Array.from(entries.entries())
    .filter(([original, { url, at }]) => url !== original && now - at <= SHORT_LINKS_STATE_TTL_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, SHORT_LINKS_STATE_MAX_ENTRIES);

  const toObject = list => Object.fromEntries(list.map(([original, { url, at }]) => [original, [url, at]]));
  let state = toObject(kept);
  let size = kept.length;
  while (size > 0 && JSON.stringify(state).length > SHORT_LINKS_STATE_MAX_BYTES) {
    size = Math.floor(size / 2);
    state = toObject(kept.slice(0, size));
  }
  return state;
}

// Links carrying UTM tags anywhere (query or fragment) already point at the landing page
const UTM_PARAM_PATTERN = /utm_(source|medium|campaign|term|content)/;

//---- _isPotentialShortLink ---------------------------------------------- 
/**
 * Determines if URL is a potential short link
 * 
 * @param {string} url - URL to check
 * @param {Array<string>} nestedPathHosts - Short-link domains whose links may contain nested paths
 * @return {boolean} True if potentially a short link
 * @private
 */
function _isPotentialShortLink(url, nestedPathHosts) {
  if (!url || typeof url !== 'string') return false;

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== 'https:' || url.includes('?') || UTM_PARAM_PATTERN.test(url)) {
      return false;
    }

    const isConfiguredHost = _isNestedPathHost(parsedUrl.hostname, nestedPathHosts);
    const pathSegments = _getPathSegments(parsedUrl.pathname, isConfiguredHost);

    if (!pathSegments.every(Boolean)) return false;

    return pathSegments.length === 1 || isConfiguredHost;
  } catch (_error) {
    return false;
  }
}

//---- _getPathSegments ---------------------------------------------------
/**
 * Splits a pathname into segments; on configured hosts one trailing slash is tolerated
 *
 * @param {string} pathname - URL pathname
 * @param {boolean} allowTrailingSlash - Whether a single trailing slash is accepted
 * @return {Array<string>} Path segments, empty strings kept so callers can reject them
 * @private
 */
function _getPathSegments(pathname, allowTrailingSlash) {
  const segments = pathname.slice(1).split('/');
  const hasTrailingSlash = segments.length > 1 && segments[segments.length - 1] === '';
  return allowTrailingSlash && hasTrailingSlash ? segments.slice(0, -1) : segments;
}

//---- _isNestedPathHost --------------------------------------------------
/**
 * Checks whether hostname equals or is a subdomain of a configured nested-path short-link domain
 *
 * @param {string} hostname - Hostname to check
 * @param {Array<string>} nestedPathHosts - Configured short-link domains
 * @return {boolean} True if hostname matches a configured domain
 * @private
 */
function _isNestedPathHost(hostname, nestedPathHosts) {
  return nestedPathHosts.some(host => hostname === host || hostname.endsWith(`.${host}`));
}

//---- _resolveShortLinks -------------------------------------------------
const SHORT_LINK_FETCH_TIMEOUT_MS = 10000;
const SHORT_LINK_MAX_REDIRECTS = 20;
const SHORT_LINK_CONCURRENCY = 10;

/**
 * Resolves short links to their full URLs, a bounded number at a time
 *
 * @param {Array} shortLinks - Array of short link objects
 * @return {Promise<Array<{originalUrl: string, resolvedUrl: string}>>} Promise resolving to array with resolved URLs
 * @private
 */
async function _resolveShortLinks(shortLinks) {
  const results = [];
  for (let i = 0; i < shortLinks.length; i += SHORT_LINK_CONCURRENCY) {
    const batch = shortLinks.slice(i, i + SHORT_LINK_CONCURRENCY);
    results.push(...(await Promise.all(batch.map(_resolveShortLink))));
  }
  return results;
}

//---- _resolveShortLink --------------------------------------------------
/**
 * Resolves one short link; on any failure the original URL is kept
 *
 * @param {{originalUrl: string}} linkObj - Short link object
 * @return {Promise<{originalUrl: string, resolvedUrl: string}>} Resolved pair
 * @private
 */
async function _resolveShortLink(linkObj) {
  const originalUrl = linkObj.originalUrl;
  try {
    return { originalUrl, resolvedUrl: await _followRedirects(originalUrl) };
  } catch (error) {
    console.log(`Failed to resolve short link ${originalUrl}: ${error.message}`);
    return { originalUrl, resolvedUrl: originalUrl };
  }
}

//---- _followRedirects ---------------------------------------------------
/**
 * Follows HTTP redirects manually so every hop is checked before it is requested
 *
 * @param {string} startUrl - URL to start from
 * @return {Promise<string>} Final URL after redirects
 * @private
 */
async function _followRedirects(startUrl) {
  let currentUrl = startUrl;
  for (let hop = 0; hop <= SHORT_LINK_MAX_REDIRECTS; hop++) {
    if (!_isPublicHttpUrl(currentUrl)) {
      throw new Error(`Refusing to request non-public URL ${currentUrl}`);
    }
    const response = await HttpUtils.fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(SHORT_LINK_FETCH_TIMEOUT_MS)
    });
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
 * @param {Object} response - Fetch response wrapper
 * @return {string|null} Redirect target or null
 * @private
 */
function _getRedirectLocation(response) {
  const status = response.getResponseCode();
  if (status < 300 || status > 399) return null;
  const headers = response.getHeaders() || {};
  return headers.location || headers.Location || null;
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
