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

    for (const advertiserId of advertiserIds) {
      for (const nodeName in fields) {
        await this.processNode({
          nodeName,
          advertiserId,
          fields: fields[nodeName] || []
        });
      }
    }
  }

  /**
   * Process a single node for a specific advertiser
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node to process
   * @param {string} options.advertiserId - Advertiser ID
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  async processNode({ nodeName, advertiserId, fields }) {
    await this.processTimeSeriesNode({
      nodeName,
      advertiserId,
      fields
    });
  }

  /**
   * Process a time series node with date-based logic
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.advertiserId - Advertiser ID
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {Object} options.storage - Storage instance
   */
  async processTimeSeriesNode({ nodeName, advertiserId, fields }) {
    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

    if (daysToFetch <= 0) {
      console.log('No days to fetch for time series data');
      return;
    }

    for (let i = 0; i < daysToFetch; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);

      const formattedDate = DateUtils.formatDate(currentDate, "UTC", "yyyy-MM-dd");

      const data = await this.source.fetchData({
        nodeName,
        accountId: advertiserId,
        date: currentDate,
        fields
      });

      this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for ${advertiserId} on ${formattedDate}` : `No records have been fetched`);

      if (data.length || this.config.CreateEmptyTables?.value) {
        const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
        await this.getStorageByNode(nodeName).saveData(preparedData);
      }

      // Only update LastRequestedDate for incremental runs
      if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(currentDate);
      }
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
