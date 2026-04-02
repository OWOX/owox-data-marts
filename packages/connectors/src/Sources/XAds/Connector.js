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

    for (const accountId of accountIds) {
      for (const nodeName in fields) {
        await this.processNode({
          nodeName,
          accountId,
          fields: fields[nodeName] || []
        });
      }

      this.source.clearCache(accountId);
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
      await this.processTimeSeriesNode({ nodeName, accountId, fields });
    } else {
      await this.processCatalogNode({ nodeName, accountId, fields });
    }
  }

  /**
   * Process a time series node (e.g., stats, stats_by_country).
   * asyncTimeSeries nodes are routed to processAsyncTimeSeriesNode.
   * All other nodes use the day-by-day fetchData loop.
   */
  async processTimeSeriesNode({ nodeName, accountId, fields }) {
    if (this.source.fieldsSchema[nodeName].asyncTimeSeries) {
      await this.processAsyncTimeSeriesNode({ nodeName, accountId, fields });
      return;
    }

    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

    if (daysToFetch <= 0) {
      console.log('No days to fetch for time series data');
      return;
    }

    for (let i = 0; i < daysToFetch; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);

      const formattedDate = DateUtils.formatDate(currentDate);

      const data = await this.source.fetchData({ nodeName, accountId, start_time: formattedDate, end_time: formattedDate, fields });

      this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for ${accountId} on ${formattedDate}` : `No records have been fetched`);

      if (data.length || this.config.CreateEmptyTables?.value) {
        const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
        const storage = await this.getStorageByNode(nodeName);
        await storage.saveData(preparedData);
      }

      if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(currentDate);
      }
    }
  }

  /**
   * Process an async time series node (e.g., stats_by_country).
   *
   * Dates are split into fixed-size chunks. For each chunk, the Source processes
   * one job at a time (submit → poll → download) and calls onBatchReady after
   * each date so the Connector can save to BigQuery and advance the cursor
   * immediately. If the run fails on date N, dates 1–(N-1) are already persisted.
   *
   * Early exit: two consecutive empty chunks are required before skipping remaining
   * days. One empty chunk may occur mid-campaign (paused days); two consecutive
   * empties is a reliable signal that ad activity has ended for the period.
   */
  async processAsyncTimeSeriesNode({ nodeName, accountId, fields }) {
    const uniqueKeys = this.source.fieldsSchema[nodeName].uniqueKeys || [];
    const missingKeys = uniqueKeys.filter(key => !fields.includes(key));
    if (missingKeys.length > 0) {
      throw new Error(`Missing required unique fields for '${nodeName}'. Missing: ${missingKeys.join(', ')}`);
    }

    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

    if (daysToFetch <= 0) {
      console.log('No days to fetch for time series data');
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

    const storage = await this.getStorageByNode(nodeName);
    const chunks = XAdsHelper.splitDatesIntoChunks(days.map(d => d.formatted));
    const dayLookup = new Map(days.map(d => [d.formatted, d.date]));

    let emptyChunks = 0;
    for (const dateChunk of chunks) {
      let chunkHasData = false;

      await this.source.fetchAsyncStatsChunk({
        nodeName,
        accountId,
        fields,
        dateChunk,
        onBatchReady: async (formatted, data) => {
          if (data.length) chunkHasData = true;

          this.config.logMessage(data.length
            ? `${data.length} rows of ${nodeName} were fetched for ${accountId} on ${formatted}`
            : 'No records have been fetched'
          );

          if (data.length || this.config.CreateEmptyTables?.value) {
            const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
            await storage.saveData(preparedData);
          }

          if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
            this.config.updateLastRequstedDate(dayLookup.get(formatted));
          }
        }
      });

      if (!chunkHasData) {
        emptyChunks++;
        if (emptyChunks >= 2) {
          console.log(`Two consecutive empty chunks — skipping remaining days`);
          break;
        }
      } else {
        emptyChunks = 0;
      }
    }
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
