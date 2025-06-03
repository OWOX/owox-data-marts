/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var RedditAdsPipeline = class RedditAdsPipeline extends AbstractPipeline {
  constructor(config, connector, storageName = "GoogleSheetsStorage") {
    super(config.mergeParameters({
      DestinationTableNamePrefix: {
        default: "reddit_ads_"
      }
    }), connector);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  startImportProcess() {
    const fields = RedditAdsHelper.parseFields(this.config.Fields.value);    
    const accountIds = RedditAdsHelper.parseAccountIds(this.config.AccountIDs.value);

    for (const accountId of accountIds) {
      for (const nodeName in fields) {
        this.processNode({
          nodeName,
          accountId,
          fields: fields[nodeName] || []
        });
      }
    }
  }

  /**
   * Process a single node for a specific account
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node to process
   * @param {string} options.accountId - Account ID
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  processNode({ nodeName, accountId, fields }) {
    const storage = this.getStorageByNode(nodeName);
    if (this.connector.fieldsSchema[nodeName].isTimeSeries) {
      this.processTimeSeriesNode({
        nodeName,
        accountId,
        fields,
        storage
      });
    } else {
      this.processCatalogNode({
        nodeName,
        accountId,
        fields,
        storage
      });
    }
  }

  /**
   * Process a time series node (e.g., reports)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.accountId - Account ID
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {Object} options.storage - Storage instance
   */
  processTimeSeriesNode({ nodeName, accountId, fields, storage }) {
    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();
  
    if (daysToFetch <= 0) {
      console.log('No days to fetch for time series data');
      return;
    }
  
    for (let i = 0; i < daysToFetch; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      
      const formattedDate = EnvironmentAdapter.formatDate(currentDate, "UTC", "yyyy-MM-dd");

      this.config.logMessage(`Start importing data for ${formattedDate}: ${accountId}/${nodeName}`);

      const data = this.connector.fetchData(nodeName, accountId, fields, currentDate);
  
      if (!data.length) {      
        if (i == 0) {
          this.config.logMessage(`ℹ️ No records have been fetched`);
        }
      } else {
        this.config.logMessage(`${data.length} records were fetched`);
        const preparedData = this.addMissingFieldsToData(data, fields);
        storage.saveData(preparedData);
      }

      this.config.updateLastRequstedDate(currentDate);
    }
  }
  
  /**
   * Process a catalog node (e.g., campaigns, ads)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.accountId - Account ID
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {Object} options.storage - Storage instance
   */
  processCatalogNode({ nodeName, accountId, fields, storage }) {
    const data = this.connector.fetchData(nodeName, accountId, fields);
    this.config.logMessage(`${data.length} rows of ${nodeName} were fetched for account ${accountId}`);

    if (data && data.length) {
      const preparedData = this.addMissingFieldsToData(data, fields);
      storage.saveData(preparedData);
    }
  }

  /**
   * Get storage instance for a node
   * @param {string} nodeName - Name of the node
   * @returns {Object} Storage instance
   */
  getStorageByNode(nodeName) {
    if (!("storages" in this)) {
      this.storages = {};
    }

    if (!(nodeName in this.storages)) {
      if (!("uniqueKeys" in this.connector.fieldsSchema[nodeName])) {
        throw new Error(`Unique keys for '${nodeName}' are not defined in the fields schema`);
      }

      const uniqueFields = this.connector.fieldsSchema[nodeName].uniqueKeys;

      this.storages[nodeName] = new globalThis[this.storageName](
        this.config.mergeParameters({
          DestinationSheetName: { value: nodeName },
          DestinationTableName: { value: this.config.DestinationTableNamePrefix.value + RedditAdsHelper.sanitizeNodeName(nodeName) }
        }),
        uniqueFields,
        this.connector.fieldsSchema[nodeName].fields,
        `${this.connector.fieldsSchema[nodeName].description} ${this.connector.fieldsSchema[nodeName].documentation}`
      );
    }

    return this.storages[nodeName];
  }
};
