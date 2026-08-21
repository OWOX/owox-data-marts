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
    const accountIds = FormatUtils.parseAccountIds(this.config.AccountIDs.value);

    // A blank-but-truthy AccountIDs (e.g. ",") passes required-field validation and parses
    // to an empty list. Without this the day loop would still run, import nothing, and walk
    // the incremental cursor to today — silently skipping every day once the config is fixed.
    if (!accountIds.length) {
      throw new Error('No valid Account IDs found in the AccountIDs parameter');
    }

    const fields = MicrosoftAdsHelper.parseFields(this.config.Fields.value);
    const nodeNames = Object.keys(fields);
    nodeNames.forEach(nodeName => this.assertKnownNode(nodeName));

    const timeSeriesNodes = nodeNames.filter(nodeName => this.source.fieldsSchema[nodeName].isTimeSeries);
    const catalogNodes = nodeNames.filter(nodeName => !this.source.fieldsSchema[nodeName].isTimeSeries);

    // Resolve the date range up front so an invalid backfill config (missing StartDate,
    // EndDate before StartDate) fails before any catalog import rather than after it.
    const dateRange = timeSeriesNodes.length ? this.getStartDateAndDaysToFetch() : null;

    this.config.logMessage(`Importing ${nodeNames.length} node(s) for account(s): ${accountIds.join(', ')}`);

    for (const accountId of accountIds) {
      for (const nodeName of catalogNodes) {
        await this.processCatalogNode({
          nodeName,
          accountId,
          fields: fields[nodeName] || []
        });
      }
    }

    if (dateRange) {
      const [startDate, daysToFetch] = dateRange;
      await this.processTimeSeriesNodes({ accountIds, timeSeriesNodes, fields, startDate, daysToFetch });
    }
  }

  /**
   * Rejects a configured node that the source no longer defines, so an outdated Fields
   * value fails with a readable message instead of a bare property-of-undefined error
   * @param {string} nodeName - Name of the node
   */
  assertKnownNode(nodeName) {
    if (!this.source.fieldsSchema[nodeName]) {
      throw new Error(`Unknown node '${nodeName}'. Please update the Fields configuration`);
    }
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
   * @param {Date} options.startDate - First date of the range
   * @param {number} options.daysToFetch - Number of days to import
   */
  async processTimeSeriesNodes({ accountIds, timeSeriesNodes, fields, startDate, daysToFetch }) {
    if (daysToFetch <= 0) {
      this.config.logMessage('No days to fetch for time series data');
      return;
    }

    for (let dayOffset = 0; dayOffset < daysToFetch; dayOffset++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + dayOffset);
      const formattedDate = DateUtils.formatDate(currentDate);

      this.config.logMessage(`Processing ${formattedDate} (day ${dayOffset + 1} of ${daysToFetch})`);

      for (const accountId of accountIds) {
        for (const nodeName of timeSeriesNodes) {
          await this.processTimeSeriesDay({
            nodeName,
            accountId,
            formattedDate,
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
   * @param {string} options.formattedDate - The day to import, as YYYY-MM-DD
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  async processTimeSeriesDay({ nodeName, accountId, formattedDate, fields }) {
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
