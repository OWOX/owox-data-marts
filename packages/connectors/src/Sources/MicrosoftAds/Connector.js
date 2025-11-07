/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var MicrosoftAdsConnector = class MicrosoftAdsConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleBigQueryStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  async startImportProcess() {
    const fields = MicrosoftAdsHelper.parseFields(this.config.Fields.value);    

    for (const nodeName in fields) {
      await this.processNode({
        nodeName,
        accountId: this.config.AccountID.value,
        fields: fields[nodeName] || []
      });
    }
  }

  /**
   * Process a single node for a specific account
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node to process
   * @param {string} options.accountId - Account ID
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  async processNode({ nodeName, accountId, fields }) {
    if (this.source.fieldsSchema[nodeName].isTimeSeries) {
      await this.processTimeSeriesNode({
        nodeName,
        accountId,
        fields
      });
    } else {
      await this.processCatalogNode({
        nodeName,
        accountId,
        fields
      });
    }
  }

  /**
   * Process a time series node (e.g., ad performance report)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.accountId - Account ID
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {Object} options.storage - Storage instance
   */
  async processTimeSeriesNode({ nodeName, accountId, fields }) {
    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();
  
    if (daysToFetch <= 0) {
      console.log('No days to fetch for time series data');
      return;
    }

    // Process data day by day
    for (let dayOffset = 0; dayOffset < daysToFetch; dayOffset++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + dayOffset);
      
      const formattedDate = DateUtils.formatDate(currentDate);
      
      this.config.logMessage(`Processing ${nodeName} for ${accountId} on ${formattedDate} (day ${dayOffset + 1} of ${daysToFetch})`);

      const data = await this.source.fetchData({ 
        nodeName, 
        accountId, 
        start_time: formattedDate, 
        end_time: formattedDate, 
        fields 
      });

      this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for ${accountId} on ${formattedDate}` : `No records have been fetched`);

      if (data.length || this.config.CreateEmptyTables?.value) {
        const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
        const storage = await this.getStorageByNode(nodeName);
        await storage.saveData(preparedData);
        data.length && this.config.logMessage(`Successfully saved ${data.length} rows for ${formattedDate}`);
      }

      // Update last requested date after each successful day
      if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(currentDate);
      }
    }
  }
  
  /**
   * Process a catalog node
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.accountId - Account ID
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {Object} options.storage - Storage instance
   */
  async processCatalogNode({ nodeName, accountId, fields }) {
    const data = await this.source.fetchData({ 
      nodeName, 
      accountId, 
      fields,
      onBatchReady: async (batchData) => {
        this.config.logMessage(`Saving batch of ${batchData.length} records to storage`);
        const preparedData = this.addMissingFieldsToData(batchData, fields);
        const storage = await this.getStorageByNode(nodeName);
        await storage.saveData(preparedData);
      }
    });
    
    this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for ${accountId}` : `No records have been fetched`);

    if (data.length || this.config.CreateEmptyTables?.value) {
      const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
      const storage = await this.getStorageByNode(nodeName);
      await storage.saveData(preparedData);
    }
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
};
