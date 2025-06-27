/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/* eslint-disable no-unused-vars, no-undef */

/**
 * ShortLinksUtils - utility functions for processing short links in data records
 * Resolves short URLs to full URLs and parses GET parameters
 */

//---- processShortLinks -------------------------------------------------
/**
 * Processes short links in data by resolving them to full URLs
 * Resolves short URLs to full URLs and parses GET parameters
 * 
 * @param {Array} data - Array of data records
 * @param {Object} config - Configuration object
 * @param {string} config.shortLinkField - Field that contains URL objects
 * @param {string} config.urlFieldName - Name of the URL field within the object
 * @return {Array} Data with processed links
 */
function processShortLinks(data, { shortLinkField, urlFieldName }) {
  if (!Array.isArray(data) || data.length === 0) return data;

  const shortLinks = _collectUniqueShortLinks(data, shortLinkField, urlFieldName);
  if (shortLinks.length === 0) return data;

  const resolvedShortLinks = _resolveShortLinks(shortLinks);
  const dataWithResolvedUrls = _addResolvedUrlsToData(data, resolvedShortLinks, shortLinkField, urlFieldName);
  return _parseGetParametersFromUrls(dataWithResolvedUrls, shortLinkField);
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
    const urlAsset = _getNestedValue(record, shortLinkField);
    const url = urlAsset && urlAsset[urlFieldName];

    if (!url || !_isPotentialShortLink(url) || uniqueLinks.has(url)) return;

    uniqueLinks.set(url, {
      originalUrl: url,
      resolvedUrl: null,
      parsedParams: null
    });
  });

  return Array.from(uniqueLinks.values());
}

//---- _getNestedValue ---------------------------------------------------
/**
 * Gets nested value from object by dot notation
 * 
 * @param {Object} obj - Object to search in
 * @param {string} path - Dot notation path
 * @return {*} Value or undefined
 * @private
 */
function _getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current && current[key], obj);
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
function _resolveShortLinks(shortLinks) {
  return shortLinks.map(linkObj => {
    try {
      const response = EnvironmentAdapter.fetch(linkObj.originalUrl, {
        method: 'GET',
        followRedirects: false,
        muteHttpExceptions: true
      });

      const headers = response.getHeaders();
      const resolvedUrl = headers.Location || headers.location || linkObj.originalUrl;

      return { ...linkObj, resolvedUrl };

    } catch (error) {
      console.log(`Failed to resolve short link ${linkObj.originalUrl}: ${error.message}`);
      return { ...linkObj, resolvedUrl: linkObj.originalUrl };
    }
  });
}

//---- _addResolvedUrlsToData ---------------------------------------------
/**
 * Adds resolved URLs back to the original data
 * 
 * @param {Array} data - Original data
 * @param {Array} resolvedShortLinks - Resolved short links
 * @param {string} shortLinkField - Field containing URLs
 * @param {string} urlFieldName - Name of the URL field within the object
 * @return {Array} New data with resolved URLs
 * @private
 */
function _addResolvedUrlsToData(data, resolvedShortLinks, shortLinkField, urlFieldName) {
  const linkMap = new Map(resolvedShortLinks.map(link => [link.originalUrl, link.resolvedUrl]));

  return data.map(record => {
    const urlAsset = _getNestedValue(record, shortLinkField);

    if (!urlAsset || !urlAsset[urlFieldName]) return record;

    const resolvedUrl = linkMap.get(urlAsset[urlFieldName]) || urlAsset[urlFieldName];
    const newRecord = { ...record };
    _setNestedValue(newRecord, shortLinkField, { ...urlAsset, parsed_url: resolvedUrl });

    return newRecord;
  });
}

//---- _parseGetParametersFromUrls ---------------------------------------
/**
 * Parses GET parameters from resolved URLs
 * 
 * @param {Array} data - Data with resolved URLs
 * @param {string} shortLinkField - Field containing URLs
 * @return {Array} New data with parsed GET parameters
 * @private
 */
function _parseGetParametersFromUrls(data, shortLinkField) {
  return data.map(record => {
    const urlAsset = _getNestedValue(record, shortLinkField);

    if (!urlAsset || !urlAsset.parsed_url) return record;

    const params = _extractGetParameters(urlAsset.parsed_url);
    if (!params) return record;

    const newRecord = { ...record };
    _setNestedValue(newRecord, shortLinkField, { ...urlAsset, get_params: params });

    return newRecord;
  });
}

//---- _extractGetParameters ---------------------------------------------
/**
 * Extracts GET parameters from URL
 * 
 * @param {string} url - URL to parse
 * @return {Object|null} Parsed parameters or null
 * @private
 */
function _extractGetParameters(url) {
  if (!url || !url.includes('?')) return null;

  const [, queryString] = url.split('?');
  const params = {};

  queryString.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key && value) {
      params[key] = decodeURIComponent(value);
    }
  });

  return Object.keys(params).length > 0 ? params : null;
}

//---- _setNestedValue ---------------------------------------------------
/**
 * Sets nested value in object by dot notation
 * 
 * @param {Object} obj - Object to update
 * @param {string} path - Dot notation path like 'user.profile.name'
 * @param {*} value - Value to set
 * @private
 */
function _setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const target = keys.slice(0, -1).reduce((current, key) => current[key] || (current[key] = {}), obj);
  target[keys[keys.length - 1]] = value;
}
