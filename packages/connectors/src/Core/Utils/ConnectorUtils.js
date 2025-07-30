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

};
