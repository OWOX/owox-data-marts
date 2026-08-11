/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/* eslint-disable no-unused-vars, no-undef */

//---- processShortLinks -------------------------------------------------
/**
 * Processes short links in data by resolving them to full URLs
 *
 * @param {Array} data - Array of data records
 * @param {Object} config - Configuration object
 * @param {string} config.shortLinkField - Field that contains URL objects
 * @param {string} config.urlFieldName - Name of the URL field within the object
 * @param {Array<string>} [config.nestedPathHosts] - Short-link domains whose links may contain nested paths
 * @return {Array} Data with processed links
 */
async function processShortLinks(data, { shortLinkField, urlFieldName, nestedPathHosts = [] }) {
  if (!Array.isArray(data) || data.length === 0) return data;

  const shortLinks = _collectUniqueShortLinks(data, shortLinkField, urlFieldName, nestedPathHosts);
  if (shortLinks.length === 0) return data;

  const resolvedShortLinks = await _resolveShortLinks(shortLinks);
  return _populateDataWithResolvedUrls(data, resolvedShortLinks, shortLinkField, urlFieldName);
}

//---- _collectUniqueShortLinks -------------------------------------------
/**
 * Collects unique short links from data
 * 
 * @param {Array} data - Data records
 * @param {string} shortLinkField - Field that contains URLs
 * @param {string} urlFieldName - Name of the URL field within the object
 * @param {Array<string>} nestedPathHosts - Short-link domains whose links may contain nested paths
 * @return {Array} Array of unique short link objects
 * @private
 */
function _collectUniqueShortLinks(data, shortLinkField, urlFieldName, nestedPathHosts) {
  const uniqueLinks = new Map();

  data.forEach(record => {
    const urlAsset = record[shortLinkField];
    const url = urlAsset && urlAsset[urlFieldName];

    if (!url || uniqueLinks.has(url) || !_isPotentialShortLink(url, nestedPathHosts)) return;

    uniqueLinks.set(url, {
      originalUrl: url,
      resolvedUrl: null
    });
  });

  return Array.from(uniqueLinks.values());
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
    // Context-less helper: write to stderr (not stdout) so this best-effort
    // diagnostic is not picked up by the host's stdout message parser.
    console.warn(`Failed to resolve short link ${originalUrl}: ${error.message}`);
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
    // Native fetch: Node returns the 3xx itself under `redirect: 'manual'`, with a
    // readable status and Location, so each hop can be vetted before it is followed.
    const response = await fetch(currentUrl, {
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

//---- _populateDataWithResolvedUrls -------------------------------------
/**
 * Populates data with resolved URLs
 * 
 * @param {Array} data - Original data
 * @param {Array} resolvedShortLinks - Resolved short links
 * @param {string} shortLinkField - Field containing URLs
 * @param {string} urlFieldName - Name of the URL field within the object
 * @return {Array} Data populated with resolved URLs
 * @private
 */
function _populateDataWithResolvedUrls(data, resolvedShortLinks, shortLinkField, urlFieldName) {
  const resolvedByOriginal = new Map(resolvedShortLinks.map(link => [link.originalUrl, link.resolvedUrl]));

  return data.map(record => {
    const urlAsset = record[shortLinkField];
    
    if (!urlAsset || !urlAsset[urlFieldName]) {
      return record;
    }
    
    const originalUrl = urlAsset[urlFieldName];
    const resolvedUrl = resolvedByOriginal.has(originalUrl) ? resolvedByOriginal.get(originalUrl) : originalUrl;
    
    if (resolvedUrl === originalUrl) {
      return record;
    }
    
    const newRecord = Object.assign({}, record);
    const newUrlAsset = Object.assign({}, urlAsset);
    newUrlAsset.parsed_url = resolvedUrl;
    
    newRecord[shortLinkField] = newUrlAsset;
    return newRecord;
  });
}
