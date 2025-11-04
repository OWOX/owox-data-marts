/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var RedditAdsConnector = class RedditAdsConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleBigQueryStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  async startImportProcess() {
    const fields = RedditAdsHelper.parseFields(this.config.Fields.value);
    const accountIds = RedditAdsHelper.parseAccountIds(this.config.AccountIDs.value);

    for (const accountId of accountIds) {
      for (const nodeName in fields) {
        await this.processNode({
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
   * Process a time series node (e.g., reports)
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

    for (let i = 0; i < daysToFetch; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);

      const formattedDate = DateUtils.formatDate(currentDate, "UTC", "yyyy-MM-dd");

      this.config.logMessage(`Start importing data for ${formattedDate}: ${accountId}/${nodeName}`);

              const data = await this.source.fetchData(nodeName, accountId, fields, currentDate);

      this.config.logMessage(data.length ? `${data.length} records were fetched` : `No records have been fetched`);

      if (data.length || this.config.CreateEmptyTables?.value) {
        const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
        await this.getStorageByNode(nodeName).saveData(preparedData);
      }

      if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(currentDate);
      }
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
  async processCatalogNode({ nodeName, accountId, fields }) {
    const data = await this.source.fetchData(nodeName, accountId, fields);

    this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for account ${accountId}` : `No records have been fetched`);

    if (data.length || this.config.CreateEmptyTables?.value) {
      const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
      await this.getStorageByNode(nodeName).saveData(preparedData);
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
    }

    return this.storages[nodeName];
  }
};
