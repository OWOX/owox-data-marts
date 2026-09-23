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
    const pathSegments = parsedUrl.pathname.slice(1).split('/');

    if (parsedUrl.protocol !== 'https:' || url.includes('?') || !pathSegments.every(Boolean)) {
      return false;
    }

    return pathSegments.length === 1 || _isNestedPathHost(parsedUrl.hostname, nestedPathHosts);
  } catch (_error) {
    return false;
  }
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
/**
 * Resolves short links to their full URLs
 *
 * @param {Array} shortLinks - Array of short link objects
 * @return {Promise<Array<{originalUrl: string, resolvedUrl: string}>>} Promise resolving to array with resolved URLs
 * @private
 */
async function _resolveShortLinks(shortLinks) {
  const promises = shortLinks.map(async linkObj => {
    try {
      const response = await HttpUtils.fetch(linkObj.originalUrl, {
        method: 'GET'
      });

      return {
        originalUrl: linkObj.originalUrl,
        resolvedUrl: response.getUrl()
      };

    } catch (error) {
      console.log(`Failed to resolve short link ${linkObj.originalUrl}: ${error.message}`);
      return {
        originalUrl: linkObj.originalUrl,
        resolvedUrl: linkObj.originalUrl
      };
    }
  });

  return Promise.all(promises);
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
  return data.map(record => {
    const urlAsset = record[shortLinkField];
    
    if (!urlAsset || !urlAsset[urlFieldName]) {
      return record;
    }
    
    const originalUrl = urlAsset[urlFieldName];
    
    const linkMatch = resolvedShortLinks.find(link => link.originalUrl === originalUrl);
    const resolvedUrl = linkMatch ? linkMatch.resolvedUrl : originalUrl;
    
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
