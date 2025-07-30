/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var LinkedInAdsConnector = class LinkedInAdsConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleSheetsStorage") {
    super(config.mergeParameters({
      DestinationTableNamePrefix: {
        default: "linkedin_ads_"
      }
    }), source);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  startImportProcess() {
    const urns = FormatUtils.parseUrns(this.config.AccountURNs.value, {prefix: 'urn:li:sponsoredAccount:'});
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
    
    // Update LastRequestedDate only for time series data
    if (isTimeSeriesNode) {
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
      
      const params = ConnectorUtils.prepareRequestParams({ fields, isTimeSeriesNode, startDate, endDate });
      const data = this.source.fetchData(nodeName, urn, params);
      console.log(`Fetched ${data.length} rows for ${nodeName}`);
      const preparedData = this.addMissingFieldsToData(data, fields);
      
      this.saveDataToStorage({ 
        nodeName, 
        urn, 
        data: preparedData, 
        ...(isTimeSeriesNode && { startDate, endDate })
      });
    }
  }

  /**
   * Save fetched data to storage
   * @param {Object} options - Storage options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.urn - URN of the processed entity
   * @param {Array} options.data - Data to save
   * @param {string} [options.startDate] - Start date for time series data
   * @param {string} [options.endDate] - End date for time series data
   */
  saveDataToStorage({ nodeName, urn, data, startDate, endDate }) {
    if (data.length) {
      this.config.logMessage(`${data.length} rows of ${nodeName} were fetched for ${urn}${endDate ? ` from ${startDate} to ${endDate}` : ''}`);
      this.getStorageByNode(nodeName).saveData(data);
    } else {
      this.config.logMessage(`No data fetched for ${nodeName} and ${urn}${endDate ? ` from ${startDate} to ${endDate}` : ''}`);
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
          DestinationSheetName: { value: nodeName },
          DestinationTableName: { value: this.config.DestinationTableNamePrefix.value + FormatUtils.toSnakeCase(nodeName) }
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
