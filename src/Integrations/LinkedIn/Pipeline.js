/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var LinkedInPipeline = class LinkedInPipeline extends AbstractPipeline {
  constructor(config, connector, storageName = "GoogleSheetsStorage") {
    super(config.mergeParameters({
      DestinationTableNamePrefix: {
        default: connector.apiType === LinkedInApiTypes.ADS ? "linkedin_ads_" : "linkedin_pages_"
      }
    }), connector);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  startImportProcess() {
    const apiType = this.connector.apiType;
    const { urns, dataSources } = this.determineApiResources(apiType);
    
    for (const nodeName in dataSources) {
      this.processNode({
        nodeName,
        urns,
        fields: dataSources[nodeName] || []
      });
    }
  }
  
  /**
   * Determine API resources (URNs and fields/tables) based on API type
   * @param {string} apiType - Type of API (LinkedInApiTypes.ADS or LinkedInApiTypes.PAGES)
   * @returns {Object} - Object containing URNs and data sources (fields for Ads, tables for Pages)
   */
  determineApiResources(apiType) {
    if (apiType === LinkedInApiTypes.ADS) {
      return {
        urns: LinkedInHelper.parseUrns(this.config.AccountURNs.value, {prefix: 'urn:li:sponsoredAccount:'}),
        dataSources: LinkedInHelper.parseFields(this.config.Fields.value)
      };
    } else if (apiType === LinkedInApiTypes.PAGES) {
      return {
        urns: LinkedInHelper.parseUrns(this.config.OrganizationURNs.value, {prefix: 'urn:li:organization:'}),
        dataSources: LinkedInHelper.parseFields(this.config.Fields.value)
      };
    } else {
      throw new Error("Unknown API type: " + apiType);
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
    const isTimeSeriesNode = this.isTimeSeriesNode(nodeName);
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
   * Fetch and save data for a node
   * @param {Object} options - Fetch options
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
      
      const params = this.prepareRequestParams({ fields, isTimeSeriesNode, startDate, endDate });
      const data = this.connector.fetchData(nodeName, urn, params);
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
      if (!("uniqueKeys" in this.connector.fieldsSchema[nodeName])) {
        throw new Error(`Unique keys for '${nodeName}' are not defined in the fields schema`);
      }

      let uniqueFields = this.connector.fieldsSchema[nodeName]["uniqueKeys"];

      this.storages[nodeName] = new globalThis[this.storageName](
        this.config.mergeParameters({
          DestinationSheetName: { value: nodeName },
          DestinationTableName: { value: this.config.DestinationTableNamePrefix.value + LinkedInHelper.toSnakeCase(nodeName) }
        }),
        uniqueFields,
        this.connector.fieldsSchema[nodeName]["fields"],
        `${this.connector.fieldsSchema[nodeName]["description"]} ${this.connector.fieldsSchema[nodeName]["documentation"]}`
      );
    }

    return this.storages[nodeName];
  }

  /**
   * Prepare request parameters
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

  /**
   * Check if a node is a time series node
   * @param {string} nodeName - Name of the node
   * @returns {boolean} - Whether the node is a time series node
   */
  isTimeSeriesNode(nodeName) {
    return this.connector.fieldsSchema[nodeName] && 
           this.connector.fieldsSchema[nodeName].isTimeSeries === true;
  }
};
