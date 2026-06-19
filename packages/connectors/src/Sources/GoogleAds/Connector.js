/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var GoogleAdsConnector = class GoogleAdsConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleBigQueryStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  async startImportProcess() {
    const customerIds = FormatUtils.parseIds(this.config.CustomerId.value, { stripCharacters: '-' });
    const fields = FormatUtils.parseFields(this.config.Fields.value);
    let lastProcessedDate = null;

    for (const nodeName in fields) {
      const processedDate = await this.processNode({
        nodeName,
        customerIds,
        fields: fields[nodeName] || [],
        updateRequestedDate: false
      });

      if (processedDate && (!lastProcessedDate || processedDate > lastProcessedDate)) {
        lastProcessedDate = processedDate;
      }
    }

    if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL && lastProcessedDate) {
      this.config.updateLastRequstedDate(lastProcessedDate);
    }
  }

  /**
   * Process a single node for all customer IDs
   * Global resources (isGlobalResource: true) return identical data for any customer ID,
   * so only the first customer ID is used to avoid redundant fetches.
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node to process
   * @param {Array<string>} options.customerIds - Array of customer IDs to process
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {boolean} options.updateRequestedDate - Whether to update incremental state per processed day
   */
  async processNode({ nodeName, customerIds, fields, updateRequestedDate = true }) {
    const idsToProcess = this.source.fieldsSchema[nodeName].isGlobalResource
      ? customerIds.slice(0, 1)
      : customerIds;
    let lastProcessedDate = null;

    for (const customerId of idsToProcess) {
      if (this.source.fieldsSchema[nodeName].isTimeSeries) {
        const processedDate = await this.processTimeSeriesNode({
          nodeName,
          customerId,
          fields,
          updateRequestedDate
        });

        if (processedDate && (!lastProcessedDate || processedDate > lastProcessedDate)) {
          lastProcessedDate = processedDate;
        }
      } else {
        await this.processCatalogNode({
          nodeName,
          customerId,
          fields
        });
      }
    }

    return lastProcessedDate;
  }

  /**
   * Process a time series node (e.g., campaigns with daily metrics)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.customerId - Customer ID
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {boolean} options.updateRequestedDate - Whether to update incremental state per processed day
   */
  async processTimeSeriesNode({ nodeName, customerId, fields, updateRequestedDate = true }) {
    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

    if (daysToFetch <= 0) {
      console.log('No days to fetch for time series data');
      return null;
    }

    let lastProcessedDate = null;

    for (let i = 0; i < daysToFetch; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      lastProcessedDate = new Date(currentDate);

      const formattedDate = DateUtils.formatDate(currentDate);

      const data = await this.source.fetchData(nodeName, customerId, { fields, startDate: currentDate });

      this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for customer ${customerId} on ${formattedDate}` : `ℹ️ No records have been fetched`);

      if (data.length || this.config.CreateEmptyTables?.value) {
        const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
        const storage = await this.getStorageByNode(nodeName);
        await storage.saveData(preparedData);
      }

      // Some callers defer the checkpoint until all customers finish successfully.
      if (updateRequestedDate && this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(currentDate);
      }
    }

    return lastProcessedDate;
  }

  /**
   * Process a catalog node (e.g., ad groups, ads, keywords)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.customerId - Customer ID
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  async processCatalogNode({ nodeName, customerId, fields }) {
    const data = await this.source.fetchData(nodeName, customerId, { fields });

    this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for customer ${customerId}` : `ℹ️ No records have been fetched`);

    if (data.length || this.config.CreateEmptyTables?.value) {
      const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
      const storage = await this.getStorageByNode(nodeName);
      await storage.saveData(preparedData);
    }
  }

  /**
   * Get or create storage instance for a node
   * @param {string} nodeName - Name of the node
   * @returns {Object} - Storage instance
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
