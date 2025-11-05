/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var OpenHolidaysConnector = class OpenHolidaysConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleBigQueryStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  async startImportProcess() {
    const fields = ConnectorUtils.parseFields(this.config.Fields.value);

    for (const nodeName in fields) {
      await this.processNode({
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
  async processNode({ nodeName, fields }) {
    const storage = this.getStorageByNode(nodeName);
    if (ConnectorUtils.isTimeSeriesNode(this.source.fieldsSchema[nodeName])) {
      await this.processTimeSeriesNode({ nodeName, fields, storage });
    } else {
      await this.processCatalogNode({ nodeName, fields, storage });
    }
  }

  /**
   * Process a time series node (public holidays)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {Object} options.storage - Storage instance
   */
  async processTimeSeriesNode({ nodeName, fields, storage }) {
    const dateRange = this.prepareDateRange();
    
    if (!dateRange) {
      console.log('No date range available for time series data');
      return;
    }

    // Fetch data for the entire period at once
    const data = await this.source.fetchData({ 
      nodeName, 
      start_time: dateRange.startDate, 
      end_time: dateRange.endDate, 
      fields 
    });

    this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched from ${dateRange.startDate} to ${dateRange.endDate}` : `No records have been fetched`);

    if (data.length || this.config.CreateEmptyTables?.value) {
      const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
      await storage.saveData(preparedData);
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
  async processCatalogNode({ nodeName, fields, storage }) {
    // Placeholder for future catalog nodes
    console.log(`Catalog node processing not implemented for ${nodeName}`);
  }

  /**
   * Get storage instance for a node
   * @param {string} nodeName - Name of the node
   * @returns {Object} Storage instance
   */
  async getStorageByNode(nodeName) {
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
        `${this.source.fieldsSchema[nodeName].description} ${this.source.fieldsSchema[nodeName].documentation}`
      );

      await this.storages[nodeName].init();
    }

    return this.storages[nodeName];
  }

  /**
   * Prepare date range for time series data
   * @returns {Object|null} - Date range object with formatted dates or null if no date range available
   */
  prepareDateRange() {
    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();
      
    if (daysToFetch <= 0) {
      return null;
    }
      
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysToFetch - 1);

    return {
      startDate: DateUtils.formatDate(startDate, "UTC", "yyyy-MM-dd"),
      endDate: DateUtils.formatDate(endDate, "UTC", "yyyy-MM-dd")
    };
  }
}
