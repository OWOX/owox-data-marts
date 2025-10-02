/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var LinkedInPagesConnector = class LinkedInPagesConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleSheetsStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  startImportProcess() {
    const urns = FormatUtils.parseIds(this.config.OrganizationURNs.value, {prefix: 'urn:li:organization:'});
    const dataSources = FormatUtils.parseFields(this.config.Fields.value);
    
    for (const nodeName in dataSources) {
      this.processNode({
        nodeName,
        urns,
        fields: dataSources[nodeName] || []
      });
    }
  }

  /**
   * Process a specific node (data entity)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node to process
   * @param {Array} options.urns - URNs to process
   * @param {Array} options.fields - Fields to fetch
   */
  processNode({ nodeName, urns, fields }) {
    const isTimeSeriesNode = ConnectorUtils.isTimeSeriesNode(this.source.fieldsSchema[nodeName]);
    const dateInfo = this.prepareDateRangeIfNeeded(nodeName, isTimeSeriesNode);
    
    if (isTimeSeriesNode && !dateInfo) {
      return; // Skip processing if date range preparation failed
    }
    
    this.fetchAndSaveData({
      nodeName, 
      urns, 
      fields,
      isTimeSeriesNode,
      ...dateInfo
    });
    
    // Update LastRequestedDate only for time series data and incremental runs
    if (isTimeSeriesNode && this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
      this.config.updateLastRequstedDate(dateInfo.endDate);
    }
  }

  /**
   * Fetch data from source and save to storage
   * @param {Object} options - Fetching options
   * @param {string} options.nodeName - Name of the node to process
   * @param {Array} options.urns - URNs to process
   * @param {Array} options.fields - Fields to fetch
   * @param {boolean} options.isTimeSeriesNode - Whether node is time series
   * @param {string} [options.startDate] - Start date for time series data
   * @param {string} [options.endDate] - End date for time series data
   */
  fetchAndSaveData({ nodeName, urns, fields, isTimeSeriesNode, startDate, endDate }) {
    for (const urn of urns) {
      console.log(`Processing ${nodeName} for ${urn}${isTimeSeriesNode ? ` from ${startDate} to ${endDate}` : ''}`);
      
      const params = { fields, ...(isTimeSeriesNode && { startDate, endDate }) };
      const data = this.source.fetchData(nodeName, urn, params);
      const preparedData = this.addMissingFieldsToData(data, fields);
      
      if (preparedData.length) {
        this.config.logMessage(`${preparedData.length} rows of ${nodeName} were fetched for ${urn}${endDate ? ` from ${startDate} to ${endDate}` : ''}`);
        this.getStorageByNode(nodeName).saveData(preparedData);
      } else {
        this.config.logMessage(`No data fetched for ${nodeName} and ${urn}${endDate ? ` from ${startDate} to ${endDate}` : ''}`);
      }
    }
  }

  /**
   * Get or create storage instance for a node
   * @param {string} nodeName - Name of the node
   * @returns {Object} - Storage instance
   */
  getStorageByNode(nodeName) {
    // initiate blank object for storages
    if (!("storages" in this)) {
      this.storages = {};
    }

    if (!(nodeName in this.storages)) {
      if (!("uniqueKeys" in this.source.fieldsSchema[nodeName])) {
        throw new Error(`Unique keys for '${nodeName}' are not defined in the fields schema`);
      }

      let uniqueFields = this.source.fieldsSchema[nodeName]["uniqueKeys"];

      this.storages[nodeName] = new globalThis[this.storageName](
        this.config.mergeParameters({
          DestinationSheetName: { value: this.source.fieldsSchema[nodeName].destinationName },
          DestinationTableName: { value: this.getDestinationName(nodeName, this.config, this.source.fieldsSchema[nodeName].destinationName) },
        }),
        uniqueFields,
        this.source.fieldsSchema[nodeName]["fields"],
        `${this.source.fieldsSchema[nodeName]["description"]} ${this.source.fieldsSchema[nodeName]["documentation"]}`
      );
    }

    return this.storages[nodeName];
  }

  /**
   * Prepare date range for time series nodes
   * @param {string} nodeName - Name of the node
   * @param {boolean} isTimeSeriesNode - Whether node is time series
   * @returns {Object|null} - Date range object or null if skipped
   */
  prepareDateRangeIfNeeded(nodeName, isTimeSeriesNode) {
    if (!isTimeSeriesNode) {
      return null;
    }
    
    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();
    if (daysToFetch <= 0) {
      console.log(`Skipping ${nodeName} as daysToFetch is ${daysToFetch}`);
      return null;
    }
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysToFetch - 1);
    console.log(`Processing time series data from ${startDate} to ${endDate}`);
    
    return { startDate, endDate };
  }

};
