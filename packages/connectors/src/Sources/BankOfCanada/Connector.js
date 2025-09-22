/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var BankOfCanadaConnector = class BankOfCanadaConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleSheetsStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  startImportProcess() {
    const fields = ConnectorUtils.parseFields(this.config.Fields.value);

    for (const nodeName in fields) {
      this.processNode({
        nodeName,
        fields: fields[nodeName] || []
      });
    }
  }

  /**
   * Process a single node
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node to process
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  processNode({ nodeName, fields }) {
    if (this.source.fieldsSchema[nodeName].isTimeSeries) {
      this.processTimeSeriesNode({ nodeName, fields });
    } else {
      this.processCatalogNode({ nodeName, fields });
    }
  }

  /**
   * Process a time series node (observations)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {Object} options.storage - Storage instance
   */
  processTimeSeriesNode({ nodeName, fields }) {
    const dateRange = this.prepareDateRange();
    
    if (!dateRange) {
      console.log('No days to fetch for time series data');
      return;
    }

    // Fetch data for the entire period at once
    const data = this.source.fetchData({ 
      nodeName, 
      start_time: dateRange.startDate, 
      end_time: dateRange.endDate, 
      fields 
    });

    this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched from ${dateRange.startDate} to ${dateRange.endDate}` : `ℹ️ No records have been fetched`);

    if (data.length || this.config.CreateEmptyTables?.value === "true") {
      const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
      this.getStorageByNode(nodeName, fields).saveData(preparedData);
    }

    if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
      this.config.updateLastRequstedDate(new Date(dateRange.endDate));
    }
  }
  
  /**
   * Process a catalog node (placeholder for future use)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {Object} options.storage - Storage instance
   */
  processCatalogNode({ nodeName, fields }) {
    // Placeholder for future catalog nodes
    console.log(`Catalog node processing not implemented for ${nodeName}`);
  }

  /**
   * Get storage instance for a node
   * @param {string} nodeName - Name of the node
   * @param {Array<string>} requestedFields
   * @returns {Object} Storage instance
   */
  getStorageByNode(nodeName, requestedFields = null) {
    if (!("storages" in this)) {
      this.storages = {};
    }

    if (!(nodeName in this.storages)) {
      if (!("uniqueKeys" in this.source.fieldsSchema[nodeName])) {
        throw new Error(`Unique keys for '${nodeName}' are not defined in the fields schema`);
      }

      const uniqueFields = this.source.fieldsSchema[nodeName].uniqueKeys;

      this.storages[nodeName] = new globalThis[this.storageName](
        this.config.mergeParameters({
          DestinationSheetName: { value: this.source.fieldsSchema[nodeName].destinationName },
          DestinationTableName: { value: this.getDestinationName(nodeName, this.config, this.source.fieldsSchema[nodeName].destinationName) },
        }),
        uniqueFields,
        this.source.fieldsSchema[nodeName].fields,
        `${this.source.fieldsSchema[nodeName].description} ${this.source.fieldsSchema[nodeName].documentation}`,
        requestedFields
      );
    }

    return this.storages[nodeName];
  }

  /**
   * Prepare date range for time series data
   * @returns {Object|null} - Date range object with formatted dates or null if no days to fetch
   */
  prepareDateRange() {
    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();
      
    if (daysToFetch <= 0) {
      return null;
    }
  
    // Calculate end date
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysToFetch - 1);
      
    return {
      startDate: EnvironmentAdapter.formatDate(startDate, "UTC", "yyyy-MM-dd"),
      endDate: EnvironmentAdapter.formatDate(endDate, "UTC", "yyyy-MM-dd")
    };
  }
}
