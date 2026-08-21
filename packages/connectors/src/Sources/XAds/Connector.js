/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var XAdsConnector = class XAdsConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleBigQueryStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  async startImportProcess() {
    const fields = XAdsHelper.parseFields(this.config.Fields.value);
    const accountIds = XAdsHelper.parseAccountIds(this.config.AccountIDs.value);
    const nodeNames = Object.keys(fields);
    const timeSeriesNodes = nodeNames.filter(nodeName => this.source.fieldsSchema[nodeName].isTimeSeries);
    const catalogNodes = nodeNames.filter(nodeName => !this.source.fieldsSchema[nodeName].isTimeSeries);
    const asyncNodes = timeSeriesNodes.filter(nodeName => this.source.fieldsSchema[nodeName].asyncTimeSeries);
    const syncNodes = timeSeriesNodes.filter(nodeName => !this.source.fieldsSchema[nodeName].asyncTimeSeries);

    // A node whose rows cannot be merged into storage is a configuration error, so it is
    // rejected before the run spends a full catalog import discovering it.
    asyncNodes.forEach(nodeName => this.assertUniqueKeysSelected(nodeName, fields[nodeName] || []));

    for (const accountId of accountIds) {
      for (const nodeName of catalogNodes) {
        await this.processCatalogNode({ nodeName, accountId, fields: fields[nodeName] || [] });
      }
    }

    try {
      await this.processTimeSeriesNodes({ accountIds, asyncNodes, syncNodes, fields });
    } finally {
      // Every account is revisited on every date now, so its cached promoted tweet IDs
      // stay in use until the whole range is done and can only be released here.
      accountIds.forEach(accountId => this.source.clearCache(accountId));
    }
  }

  /**
   * Imports every time series node for every account, one date at a time.
   *
   * The loop is date-outer on purpose: the incremental cursor may only move once a
   * date is complete for *all* accounts and nodes, so a run interrupted midway
   * resumes from the last fully imported date instead of restarting the range.
   *
   * Async nodes submit one job per chunk of dates, so when any of them is selected
   * the cursor advances a whole chunk at a time. Otherwise every chunk is one day.
   *
   * @param {Object} options - Processing options
   * @param {Array<string>} options.accountIds - Account IDs to import
   * @param {Array<string>} options.asyncNodes - Time series nodes served by the async jobs API
   * @param {Array<string>} options.syncNodes - Time series nodes fetched one day at a time
   * @param {Object} options.fields - Map of node name to the fields selected for it
   */
  async processTimeSeriesNodes({ accountIds, asyncNodes, syncNodes, fields }) {
    if (!asyncNodes.length && !syncNodes.length) {
      return;
    }

    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

    if (daysToFetch <= 0) {
      this.config.logMessage('No days to fetch for time series data');
      return;
    }

    // Build date list with both forms needed downstream.
    // Use UTC to avoid DST shifts when advancing dates.
    const days = [];
    for (let i = 0; i < daysToFetch; i++) {
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + i);
      days.push({ date, formatted: DateUtils.formatDate(date) });
    }

    const dayLookup = new Map(days.map(d => [d.formatted, d.date]));
    const formattedDays = days.map(d => d.formatted);
    const chunks = asyncNodes.length
      ? XAdsHelper.splitDatesIntoChunks(formattedDays)
      : formattedDays.map(formatted => [formatted]);

    for (const dateChunk of chunks) {
      await this.importAsyncNodesForChunk({ dateChunk, asyncNodes, accountIds, fields });
      await this.importSyncNodesForChunk({ dateChunk, syncNodes, accountIds, fields, dayLookup });

      // Every account and node stored every date in this chunk, so the cursor can move past it.
      if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(dayLookup.get(dateChunk[dateChunk.length - 1]));
      }
    }
  }

  /**
   * Import one chunk of dates of every async node, for every account
   * @param {Object} options - Processing options
   * @param {Array<string>} options.dateChunk - Formatted dates covered by this job
   * @param {Array<string>} options.asyncNodes - Async time series nodes to import
   * @param {Array<string>} options.accountIds - Account IDs to import
   * @param {Object} options.fields - Map of node name to the fields selected for it
   */
  async importAsyncNodesForChunk({ dateChunk, asyncNodes, accountIds, fields }) {
    for (const nodeName of asyncNodes) {
      for (const accountId of accountIds) {
        await this.processAsyncTimeSeriesChunk({
          nodeName,
          accountId,
          fields: fields[nodeName] || [],
          dateChunk
        });
      }
    }
  }

  /**
   * Import every date of a chunk of every sync node, for every account
   * @param {Object} options - Processing options
   * @param {Array<string>} options.dateChunk - Formatted dates to import
   * @param {Array<string>} options.syncNodes - Sync time series nodes to import
   * @param {Array<string>} options.accountIds - Account IDs to import
   * @param {Object} options.fields - Map of node name to the fields selected for it
   * @param {Map<string, Date>} options.dayLookup - Formatted date to Date instance
   */
  async importSyncNodesForChunk({ dateChunk, syncNodes, accountIds, fields, dayLookup }) {
    for (const formatted of dateChunk) {
      for (const nodeName of syncNodes) {
        for (const accountId of accountIds) {
          await this.processTimeSeriesDay({
            nodeName,
            accountId,
            date: dayLookup.get(formatted),
            fields: fields[nodeName] || []
          });
        }
      }
    }
  }

  /**
   * Rejects a node whose unique keys are not all selected, before any data is fetched
   * @param {string} nodeName - Name of the node
   * @param {Array<string>} fields - Fields selected for this node
   */
  assertUniqueKeysSelected(nodeName, fields) {
    const uniqueKeys = this.source.fieldsSchema[nodeName].uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));

    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for '${nodeName}'. Missing: ${missingKeys.join(', ')}`);
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

    const data = await this.source.fetchData({ nodeName, accountId, start_time: formattedDate, end_time: formattedDate, fields });

    this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for ${accountId} on ${formattedDate}` : `No records have been fetched`);

    if (data.length || this.config.CreateEmptyTables?.value) {
      const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
      const storage = await this.getStorageByNode(nodeName);
      await storage.saveData(preparedData);
    }
  }

  /**
   * Fetch and store one chunk of dates of an async time series node for one account.
   *
   * The Source processes one job at a time (submit → poll → download) and calls
   * onBatchReady after each date so the Connector can save it.
   *
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.accountId - Account ID
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {Array<string>} options.dateChunk - Formatted dates covered by this job
   */
  async processAsyncTimeSeriesChunk({ nodeName, accountId, fields, dateChunk }) {
    const storage = await this.getStorageByNode(nodeName);

    await this.source.fetchData({
      nodeName,
      accountId,
      fields,
      dateChunk,
      onBatchReady: async (formatted, data) => {
        this.config.logMessage(data.length
          ? `${data.length} rows of ${nodeName} were fetched for ${accountId} on ${formatted}`
          : 'No records have been fetched'
        );

        if (data.length || this.config.CreateEmptyTables?.value) {
          const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
          await storage.saveData(preparedData);
        }
      }
    });
  }

  /**
   * Process a catalog node (e.g., campaigns, line items)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.accountId - Account ID
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {Object} options.storage - Storage instance
   */
  async processCatalogNode({ nodeName, accountId, fields }) {
    const data = await this.source.fetchData({ nodeName, accountId, fields });

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
}
