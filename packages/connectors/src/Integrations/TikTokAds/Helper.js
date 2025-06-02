/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const TikTokAdsHelper = {
  /**
   * Parse fields string into a structured object
   * @param {string} fieldsString - Fields string in format "nodeName fieldName, nodeName fieldName"
   * @return {Object} Object with node names as keys and arrays of field names as values
   */
  parseFields(fieldsString) {
    return fieldsString.split(/,\s*/).reduce((acc, pair) => {
      let [key, value] = pair.trim().split(/\s+/, 2);
      if (key && value) {
        (acc[key] = acc[key] || []).push(value.trim());
      }
      return acc;
    }, {});
  },

  /**
   * Parse advertiser IDs from configuration
   * @param {string} advertiserIdsString - Comma/semicolon separated list of advertiser IDs
   * @returns {Array<string>} Array of advertiser IDs
   */
  parseAdvertiserIds(advertiserIdsString) {
    return String(advertiserIdsString)
      .split(/[,;]\s*/)
      .map(id => id.trim())
      .filter(id => id);
  }
}; 