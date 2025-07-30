/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Utilities for parsing and formatting data
 */
var FormatUtils = {
  /**
   * Universal URN parser: parses comma/semicolon separated string to array of numeric IDs
   * @param {string} urnsString - Comma/semicolon separated list of IDs/URNs
   * @param {Object} options
   * @param {string} options.prefix - URN prefix, e.g. 'urn:li:organization:'
   * @return {Array<number>} Array of numeric IDs
   */
  parseUrns: function(urnsString, {prefix}) {
    return String(urnsString)
      .split(/[,;]\s*/)
      .map(urn => this.formatUrn(urn.trim(), {prefix}));
  },

  /**
   * Universal URN formatter: extracts numeric ID from URN or returns number if already numeric
   * @param {string|number} urn
   * @param {Object} options
   * @param {string} options.prefix - URN prefix, e.g. 'urn:li:organization:'
   * @return {number} Numeric ID
   */
  formatUrn: function(urn, {prefix}) {
    if (typeof urn === 'string' && urn.startsWith(prefix)) {
      return parseInt(urn.replace(prefix, ''));
    }
    return parseInt(urn);
  },

  /**
   * Parse fields string into a structured object
   * @param {string} fieldsString - Fields string in format "nodeName fieldName, nodeName fieldName"
   * @return {Object} Object with node names as keys and arrays of field names as values
   */
  parseFields: function(fieldsString) {
    return fieldsString.split(", ").reduce((acc, pair) => {
      let [key, value] = pair.split(" ");
      (acc[key] = acc[key] || []).push(value.trim());
      return acc;
    }, {});
  },

  /**
   * Format an array of field names for use in API URLs
   * @param {Array<string>} fields - Array of field names
   * @return {string} Comma-separated string of URL-encoded field names
   */
  formatFields: function(fields) {
    return fields.map(field => encodeURIComponent(field)).join(",");
  },
  
  /**
   * Format date for URL parameters
   * @param {Date} date - Date object
   * @return {string} Formatted date string
   */
  formatDateForUrl: function(date) {
    return `(year:${date.getFullYear()},month:${date.getMonth() + 1},day:${date.getDate()})`;
  },

  /**
   * Convert a string to snake_case:
   * - Inserts an underscore between lowercase-to-uppercase transitions
   * - Converts the entire string to lowercase
   * - Replaces any non-alphanumeric or underscore characters with '_'
   * @param {string} str
   * @returns {string}
   */
  toSnakeCase: function(str) {
    return str
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
  }
};