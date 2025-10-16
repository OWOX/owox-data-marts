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
   * @param {string} [options.stripCharacters] - Characters to remove from ID
   * @return {Array<number>} Array of numeric IDs
   */
  parseIds: function(idsString, {prefix, stripCharacters = ''}) {
    return String(idsString)
      .split(/[,;]\s*/)
      .map(id => this.formatId(id.trim(), {prefix, stripCharacters}));
  },

  /**
   * Universal ID formatter: extracts numeric ID from prefixed string or returns number if already numeric
   * @param {string|number} id
   * @param {Object} options
   * @param {string} options.prefix - ID prefix, e.g. 'urn:li:organization:'
   * @param {string} [options.stripCharacters] - Characters to remove from ID
   * @return {number} Numeric ID
   */
  formatId: function(id, {prefix, stripCharacters = ''}) {
    if (stripCharacters) {
      id = String(id).split(stripCharacters).join('');
    }
    
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
  }
};