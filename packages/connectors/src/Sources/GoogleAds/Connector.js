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
    const nodeNames = Object.keys(fields);
    const timeSeriesNodes = nodeNames.filter(nodeName => this.source.fieldsSchema[nodeName].isTimeSeries);
    const catalogNodes = nodeNames.filter(nodeName => !this.source.fieldsSchema[nodeName].isTimeSeries);

    for (const nodeName of catalogNodes) {
      for (const customerId of this.customerIdsForNode(nodeName, customerIds)) {
        await this.processCatalogNode({
          nodeName,
          customerId,
          fields: fields[nodeName] || []
        });
      }
    }

    await this.processTimeSeriesNodes({ customerIds, timeSeriesNodes, fields });
  }

  /**
   * Customer IDs a node has to be fetched for.
   * Global resources (isGlobalResource: true) return identical data for any customer ID,
   * so only the first customer ID is used to avoid redundant fetches.
   * @param {string} nodeName - Name of the node
   * @param {Array<string>} customerIds - Every customer ID configured for the run
   * @returns {Array<string>} - Customer IDs to fetch this node for
   */
  customerIdsForNode(nodeName, customerIds) {
    return this.source.fieldsSchema[nodeName].isGlobalResource
      ? customerIds.slice(0, 1)
      : customerIds;
  }

  /**
   * Imports every time series node for every customer, one date at a time.
   *
   * The loop is date-outer on purpose: the incremental cursor may only move once a
   * date is complete for *all* customers and nodes, so a run interrupted midway
   * resumes from the last fully imported date instead of restarting the range.
   *
   * @param {Object} options - Processing options
   * @param {Array<string>} options.customerIds - Customer IDs to import
   * @param {Array<string>} options.timeSeriesNodes - Names of the time series nodes to import
   * @param {Object} options.fields - Map of node name to the fields selected for it
   */
  async processTimeSeriesNodes({ customerIds, timeSeriesNodes, fields }) {
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
        for (const customerId of this.customerIdsForNode(nodeName, customerIds)) {
          await this.processTimeSeriesDay({
            nodeName,
            customerId,
            date: currentDate,
            fields: fields[nodeName] || []
          });
        }
      }

      // Every customer and node stored this date, so the cursor can move past it.
      if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(currentDate);
      }
    }
  }

  /**
   * Fetch and store a single day of a time series node for one customer
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.customerId - Customer ID
   * @param {Date} options.date - The day to import
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  async processTimeSeriesDay({ nodeName, customerId, date, fields }) {
    const formattedDate = DateUtils.formatDate(date);

    const data = await this.source.fetchData(nodeName, customerId, { fields, startDate: date });

    this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for customer ${customerId} on ${formattedDate}` : `ℹ️ No records have been fetched`);

    if (data.length || this.config.CreateEmptyTables?.value) {
      const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
      const storage = await this.getStorageByNode(nodeName);
      await storage.saveData(preparedData);
    }
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
