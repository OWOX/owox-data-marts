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
 * @return {Array} Data with processed links
 */
async function processShortLinks(data, { shortLinkField, urlFieldName }) {
  if (!Array.isArray(data) || data.length === 0) return data;

  const shortLinks = _collectUniqueShortLinks(data, shortLinkField, urlFieldName);
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
 * @return {Array} Array of unique short link objects
 * @private
 */
function _collectUniqueShortLinks(data, shortLinkField, urlFieldName) {
  const uniqueLinks = new Map();

  data.forEach(record => {
    const urlAsset = record[shortLinkField];
    const url = urlAsset && urlAsset[urlFieldName];

    if (!url || !_isPotentialShortLink(url) || uniqueLinks.has(url)) return;

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
 * @return {boolean} True if potentially a short link
 * @private
 */
function _isPotentialShortLink(url) {
  if (!url || typeof url !== 'string') return false;

  // Skip URLs with query parameters or UTM parameters
  const hasParams = url.includes('?') || ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].some(param => url.includes(param));
  if (hasParams) return false;

  // Check for simple structure: https://hostname.com/path (no subpaths)
  return /^https:\/\/[^\/]+\/[^\/]+$/.test(url);
}

//---- _resolveShortLinks -------------------------------------------------
/**
 * Resolves short links to their full URLs
 *
 * @param {Array} shortLinks - Array of short link objects
 * @return {Array} New array with resolved URLs
 * @private
 */
async function _resolveShortLinks(shortLinks) {
  const promises = shortLinks.map(async linkObj => {
    try {
      const response = await HttpUtils.fetch(linkObj.originalUrl, {
        method: 'GET',
        followRedirects: false,
        muteHttpExceptions: true
      });

      const headers = response.getHeaders();
      const resolvedUrl = headers.Location || headers.location || linkObj.originalUrl;

      return {
        originalUrl: linkObj.originalUrl,
        resolvedUrl: resolvedUrl
      };

    } catch (error) {
      console.log(`Failed to resolve short link ${linkObj.originalUrl}: ${error.message}`);
      return {
        originalUrl: linkObj.originalUrl,
        resolvedUrl: linkObj.originalUrl
      };
    }
  });

  return await Promise.all(promises);
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
