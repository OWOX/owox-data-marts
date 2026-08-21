/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var CriteoAdsConnector = class CriteoAdsConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleBigQueryStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   */
  async startImportProcess() {
    const fields = CriteoAdsHelper.parseFields(this.config.Fields?.value || "");
    const advertiserIds = CriteoAdsHelper.parseAdvertiserIds(this.config.AdvertiserIDs?.value || "");

    // A blank-but-truthy AdvertiserIDs (e.g. ";") passes required-field validation and parses
    // to an empty list. Without this the day loop would still run, fetch nothing, and walk the
    // incremental cursor to today — marking days as imported that never were.
    if (!advertiserIds.length) {
      throw new Error('No valid Advertiser IDs found in the AdvertiserIDs parameter');
    }

    const nodeNames = Object.keys(fields);
    // Every node in the Criteo schema is a time series, and this connector has no catalog
    // path, so anything else would silently be re-fetched once per day by the loop below.
    const unsupportedNodes = nodeNames.filter(
      nodeName => !this.source.fieldsSchema[nodeName]?.isTimeSeries
    );

    if (unsupportedNodes.length) {
      throw new Error(`Only time series nodes are supported. Unsupported: ${unsupportedNodes.join(', ')}`);
    }

    await this.processTimeSeriesNodes({ advertiserIds, timeSeriesNodes: nodeNames, fields });
  }

  /**
   * Imports every node for every advertiser, one date at a time.
   *
   * The loop is date-outer on purpose: the incremental cursor may only move once a
   * date is complete for *all* advertisers and nodes, so a run interrupted midway
   * resumes from the last fully imported date instead of restarting the range.
   *
   * @param {Object} options - Processing options
   * @param {Array<string>} options.advertiserIds - Advertiser IDs to import
   * @param {Array<string>} options.timeSeriesNodes - Names of the nodes to import
   * @param {Object} options.fields - Map of node name to the fields selected for it
   */
  async processTimeSeriesNodes({ advertiserIds, timeSeriesNodes, fields }) {
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
        for (const advertiserId of advertiserIds) {
          await this.processTimeSeriesDay({
            nodeName,
            advertiserId,
            date: currentDate,
            fields: fields[nodeName] || []
          });
        }
      }

      // Every advertiser and node stored this date, so the cursor can move past it.
      if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(currentDate);
      }
    }
  }

  /**
   * Fetch and store a single day of a node for one advertiser
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.advertiserId - Advertiser ID
   * @param {Date} options.date - The day to import
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  async processTimeSeriesDay({ nodeName, advertiserId, date, fields }) {
    const formattedDate = DateUtils.formatDate(date);

    const data = await this.source.fetchData({
      nodeName,
      accountId: advertiserId,
      date,
      fields
    });

    this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for ${advertiserId} on ${formattedDate}` : `No records have been fetched`);

    if (data.length || this.config.CreateEmptyTables?.value) {
      const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
      const storage = await this.getStorageByNode(nodeName, fields);
      await storage.saveData(preparedData);
    }
  }

  /**
   * Get storage instance for a node
   * @param {string} nodeName - Name of the node
   * @param {Array<string>} fields - Fields selected for this node
   * @returns {Object} Storage instance
   */
  async getStorageByNode(nodeName, fields = []) {
    if (!("storages" in this)) {
      this.storages = {};
    }

    if (!(nodeName in this.storages)) {
      if (!("uniqueKeys" in this.source.fieldsSchema[nodeName])) {
        throw new Error(`Unique keys for '${nodeName}' are not defined in the fields schema`);
      }

      const uniqueFields = this.source.fieldsSchema[nodeName].uniqueKeys;
      const storageConfig = this._buildStorageConfig({ nodeName, fields, uniqueFields });

      this.storages[nodeName] = new globalThis[this.storageName](
        storageConfig,
        uniqueFields,
        this.source.fieldsSchema[nodeName].fields,
        `${this.source.fieldsSchema[nodeName].description} ${this.source.fieldsSchema[nodeName].documentation}`
      );

      await this.storages[nodeName].init();
    }

    return this.storages[nodeName];
  }

  /**
   * Build a storage-specific config without mutating the connector config.
   * Storage parses Fields itself, so pass only the fields for the current node.
   * @param {Object} options
   * @param {string} options.nodeName
   * @param {Array<string>} options.fields
   * @param {Array<string>} options.uniqueFields
   * @returns {Object}
   * @private
   */
  _buildStorageConfig({ nodeName, fields, uniqueFields }) {
    const scopedFields = [...fields];
    for (const field of uniqueFields) {
      if (!scopedFields.includes(field)) {
        scopedFields.push(field);
      }
    }

    const storageConfig = Object.assign(
      Object.create(Object.getPrototypeOf(this.config)),
      this.config
    );

    return storageConfig.mergeParameters({
      DestinationSheetName: { value: this.source.fieldsSchema[nodeName].destinationName },
      DestinationTableName: { value: this.getDestinationName(nodeName, this.config, this.source.fieldsSchema[nodeName].destinationName) },
      Fields: { value: scopedFields.map(field => `${nodeName} ${field}`).join(", ") }
    });
  }
};
