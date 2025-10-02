/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * General utilities for connector operations
 */
var ConnectorUtils = {
  /**
   * Check if a node is a time series node
   * @param {Object} nodeSchema - The node schema object (fieldsSchema[nodeName])
   * @returns {boolean} - Whether the node is a time series node
   */
  isTimeSeriesNode(nodeSchema) {
    return nodeSchema && nodeSchema.isTimeSeries === true;
  },

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

};
