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
 * @param {Object} config - Configuration object with settings
 * @return {Array} Data with processed links
 */
function processShortLinks(data, config = {}) {
  const { shortLinkFields } = config;

  if (!data.length) {
    return data;
  }

  // Collect unique short links
  const shortLinks = _collectUniqueShortLinks(data, shortLinkFields);
  
  if (shortLinks.length === 0) {
    return data;
  }

  // Resolve short links to full URLs (returns new objects)
  const resolvedShortLinks = _resolveShortLinks(shortLinks);

  // Add resolved URLs back to data (returns new data)
  const dataWithResolvedUrls = _addResolvedUrlsToData(data, resolvedShortLinks, shortLinkFields);

  // Parse GET parameters from resolved URLs (returns new data)
  const finalData = _parseGetParametersFromUrls(dataWithResolvedUrls, shortLinkFields);

  return finalData;
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
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

//---- _collectUniqueShortLinks -------------------------------------------
/**
 * Collects unique short links from data
 * 
 * @param {Array} data - Data records
 * @param {Array} shortLinkFields - Fields that contain URLs
 * @return {Array} Array of unique short link objects
 * @private
 */
function _collectUniqueShortLinks(data, shortLinkFields) {
  const uniqueLinks = new Map();

  data.forEach(record => {
    shortLinkFields.forEach(fieldName => {
      const urlAsset = _getNestedValue(record, fieldName);
      
      if (urlAsset && urlAsset.website_url) {
        const url = urlAsset.website_url;
        
        // Check if it's a potential short link (no query parameters, simple structure)
        if (_isPotentialShortLink(url) && !uniqueLinks.has(url)) {
          uniqueLinks.set(url, {
            originalUrl: url,
            resolvedUrl: null,
            parsedParams: null
          });
        }
      }
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
  if (url.includes('?') || 
      url.includes('utm_source') || 
      url.includes('utm_medium') || 
      url.includes('utm_campaign') ||
      url.includes('utm_term') || 
      url.includes('utm_content')) {
    return false;
  }

  // Check for simple structure: https://hostname.com/path
  const urlParts = url.split('/');
  return urlParts[0] === 'https:' && 
         urlParts[1] === '' && 
         urlParts.length === 4 && 
         urlParts[3] && urlParts[3] !== '';
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
      
      // Try different header names for Location (Node.js uses lowercase)
      const resolvedUrl = headers.Location || headers.location || headers['Location'] || headers['location'] || linkObj.originalUrl;
      
      // Create new object instead of mutating
      return {
        originalUrl: linkObj.originalUrl,
        resolvedUrl: resolvedUrl,
        parsedParams: null
      };
      
    } catch (error) {
      console.log(`Failed to resolve short link ${linkObj.originalUrl}: ${error.message}`);
      
      // Create new object with original URL as resolved
      return {
        originalUrl: linkObj.originalUrl,
        resolvedUrl: linkObj.originalUrl,
        parsedParams: null
      };
    }
  });
}

//---- _addResolvedUrlsToData ---------------------------------------------
/**
 * Adds resolved URLs back to the original data
 * 
 * @param {Array} data - Original data
 * @param {Array} resolvedShortLinks - Resolved short links
 * @param {Array} shortLinkFields - Fields containing URLs
 * @return {Array} New data with resolved URLs
 * @private
 */
function _addResolvedUrlsToData(data, resolvedShortLinks, shortLinkFields) {
  const linkMap = new Map(
    resolvedShortLinks.map(link => [link.originalUrl, link.resolvedUrl])
  );

  return data.map(record => {
    const newRecord = { ...record };
    
    shortLinkFields.forEach(fieldName => {
      const urlAsset = _getNestedValue(newRecord, fieldName);
      
      if (urlAsset && urlAsset.website_url) {
        const resolvedUrl = linkMap.get(urlAsset.website_url);
        
        // Use resolved URL if found, otherwise fallback to original
        const parsedUrl = resolvedUrl || urlAsset.website_url;
        
        const newUrlAsset = {
          ...urlAsset,
          parsed_url: parsedUrl
        };
        
        _setNestedValue(newRecord, fieldName, newUrlAsset);
      }
    });
    
    return newRecord;
  });
}

//---- _parseGetParametersFromUrls ---------------------------------------
/**
 * Parses GET parameters from resolved URLs
 * 
 * @param {Array} data - Data with resolved URLs
 * @param {Array} shortLinkFields - Fields containing URLs
 * @return {Array} New data with parsed GET parameters
 * @private
 */
function _parseGetParametersFromUrls(data, shortLinkFields) {
  return data.map(record => {
    const newRecord = { ...record };
    
    shortLinkFields.forEach(fieldName => {
      const urlAsset = _getNestedValue(newRecord, fieldName);
      
      if (urlAsset && urlAsset.parsed_url) {
        const params = _extractGetParameters(urlAsset.parsed_url);
        if (params && Object.keys(params).length > 0) {
          // Create new nested object with GET parameters
          const newUrlAsset = {
            ...urlAsset,
            get_params: params
          };
          
          _setNestedValue(newRecord, fieldName, newUrlAsset);
        }
      }
    });
    
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
  const getParams = [];
  
  const paramPairs = queryString.includes('&') ? 
    queryString.split('&') : [queryString];
  
  paramPairs.forEach(pair => {
    if (pair.includes('=')) {
      const [key, value] = pair.split('=');
      if (key && value) {
        getParams.push([key, decodeURIComponent(value)]);
      }
    }
  });

  if (getParams.length > 0) {
    return Object.fromEntries(getParams);
  }

  return null;
}

//---- _setNestedValue ---------------------------------------------------
/**
 * Sets nested value in object by dot notation
 * 
 * @param {Object} obj - Object to update
 * @param {string} path - Dot notation path
 * @param {*} value - Value to set
 * @private
 */
function _setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value;
    } else {
      current = current[key] || {};
    }
  });
} 