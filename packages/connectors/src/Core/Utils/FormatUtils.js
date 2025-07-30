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
   * Universal ID parser: parses comma/semicolon separated string to array of numeric IDs
   * @param {string} idsString - Comma/semicolon separated list of IDs
   * @param {Object} options
   * @param {string} options.prefix - ID prefix, e.g. 'urn:li:organization:'
   * @return {Array<number>} Array of numeric IDs
   */
  parseIds: function(idsString, {prefix}) {
    return String(idsString)
      .split(/[,;]\s*/)
      .map(id => this.formatId(id.trim(), {prefix}));
  },

  /**
   * Universal ID formatter: extracts numeric ID from prefixed string or returns number if already numeric
   * @param {string|number} id
   * @param {Object} options
   * @param {string} options.prefix - ID prefix, e.g. 'urn:li:organization:'
   * @return {number} Numeric ID
   */
  formatId: function(id, {prefix}) {
    if (typeof id === 'string' && id.startsWith(prefix)) {
      return parseInt(id.replace(prefix, ''));
    }
    return parseInt(id);
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