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
   * Prepare request parameters for API calls
   * @param {Object} options - Parameter options
   * @param {Array} options.fields - Fields to fetch
   * @param {boolean} options.isTimeSeriesNode - Whether node is time series
   * @param {string} [options.startDate] - Start date for time series data
   * @param {string} [options.endDate] - End date for time series data
   * @returns {Object} - Prepared parameters
   */
  prepareRequestParams({ fields, isTimeSeriesNode, startDate, endDate }) {
    const params = { fields };
    
    if (isTimeSeriesNode) {
      params.startDate = startDate;
      params.endDate = endDate;
    }
    
    return params;
  }
};