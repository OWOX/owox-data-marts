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
    const nodeNames = Object.keys(fields);
    const timeSeriesNodes = nodeNames.filter(nodeName => this.source.fieldsSchema[nodeName].isTimeSeries);
    const catalogNodes = nodeNames.filter(nodeName => !this.source.fieldsSchema[nodeName].isTimeSeries);

    for (const accountId of accountIds) {
      for (const nodeName of catalogNodes) {
        await this.processCatalogNode({
          nodeName,
          accountId,
          fields: fields[nodeName] || []
        });
      }
    }

    await this.processTimeSeriesNodes({ accountIds, timeSeriesNodes, fields });
  }

  /**
   * Imports every time series node for every account, one date at a time.
   *
   * The loop is date-outer on purpose: the incremental cursor may only move once a
   * date is complete for *all* accounts and nodes, so a run interrupted midway
   * resumes from the last fully imported date instead of restarting the range.
   *
   * @param {Object} options - Processing options
   * @param {Array<string>} options.accountIds - Account IDs to import
   * @param {Array<string>} options.timeSeriesNodes - Names of the time series nodes to import
   * @param {Object} options.fields - Map of node name to the fields selected for it
   */
  async processTimeSeriesNodes({ accountIds, timeSeriesNodes, fields }) {
    if (!timeSeriesNodes.length) {
      return;
    }

    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

    if (daysToFetch <= 0) {
      this.config.logMessage('No days to fetch for time series data');
      return;
    }

    for (let dayOffset = 0; dayOffset < daysToFetch; dayOffset++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + dayOffset);

      for (const nodeName of timeSeriesNodes) {
        for (const accountId of accountIds) {
          await this.processTimeSeriesDay({
            nodeName,
            accountId,
            date: currentDate,
            fields: fields[nodeName] || []
          });
        }
      }

      // Every account and node stored this date, so the cursor can move past it.
      if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(currentDate);
      }
    }
  }

  /**
   * Fetch and store a single day of a time series node for one account
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.accountId - Account ID
   * @param {Date} options.date - The day to import
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  async processTimeSeriesDay({ nodeName, accountId, date, fields }) {
    const formattedDate = DateUtils.formatDate(date);

    this.config.logMessage(`Start importing data for ${formattedDate}: ${accountId}/${nodeName}`);

    const data = await this.source.fetchData(nodeName, accountId, fields, date);

    this.config.logMessage(data.length ? `${data.length} records were fetched` : `No records have been fetched`);

    if (data.length || this.config.CreateEmptyTables?.value) {
      const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
      const storage = await this.getStorageByNode(nodeName);
      await storage.saveData(preparedData);
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
