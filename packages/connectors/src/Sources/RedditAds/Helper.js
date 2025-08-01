/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const RedditAdsHelper = {
  /**
   * Parse fields string into a structured object
   * @param {string} fieldsString - Fields string in format "nodeName fieldName, nodeName fieldName"
   * @return {Object} Object with node names as keys and arrays of field names as values
   */
  parseFields(fieldsString) {
    return fieldsString.split(", ").reduce((acc, pair) => {
      let [key, value] = pair.split(" ");
      (acc[key] = acc[key] || []).push(value.trim());
      return acc;
    }, {});
  },

  /**
   * Parse account IDs from configuration
   * @param {string} accountIdsString - Comma/semicolon separated list of account IDs
   * @returns {Array<string>} Array of account IDs
   */
  parseAccountIds(accountIdsString) {
    return String(accountIdsString)
      .split(/[,;]\s*/)
      .map(id => id.trim());
  }
};
