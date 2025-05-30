/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var CriteoAdsPipeline = class CriteoAdsPipeline extends AbstractPipeline {
  constructor(config, connector, storageName = "GoogleSheetsStorage") {
    super(config.mergeParameters({
      DestinationTableNamePrefix: {
        default: "criteo_ads_"
      }
    }), connector);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   */
  startImportProcess() {
    const fields = CriteoAdsHelper.parseFields(this.config.Fields?.value || "");    
    const advertiserIds = CriteoAdsHelper.parseAdvertiserIds(this.config.AdvertiserIDs?.value || "");

    for (const advertiserId of advertiserIds) {
      for (const nodeName in fields) {
        this.processNode({
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
  processNode({ nodeName, advertiserId, fields }) {
    const storage = this.getStorageByNode(nodeName);
    this.processTimeSeriesNode({
      nodeName,
      advertiserId,
      fields,
      storage
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
  processTimeSeriesNode({ nodeName, advertiserId, fields, storage }) {
    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();
  
    if (daysToFetch <= 0) {
      console.log('No days to fetch for time series data');
      return;
    }
  
    for (let i = 0; i < daysToFetch; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      
      const formattedDate = EnvironmentAdapter.formatDate(currentDate, "UTC", "yyyy-MM-dd");

      const data = this.connector.fetchData({ 
        nodeName, 
        accountId: advertiserId, 
        date: currentDate, 
        fields 
      });

      this.config.logMessage(`${data.length} rows of ${nodeName} were fetched for ${advertiserId} on ${formattedDate}`);

      if (data.length > 0) {
        const preparedData = this.addMissingFieldsToData(data, fields);
        storage.saveData(preparedData);
      }

      this.config.updateLastRequstedDate(currentDate);
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
          DestinationTableName: { value: this.config.DestinationTableNamePrefix.value + nodeName.replace(/[^a-zA-Z0-9_]/g, "_") }
        }),
        uniqueFields,
        this.connector.fieldsSchema[nodeName].fields,
        `${this.connector.fieldsSchema[nodeName].description} ${this.connector.fieldsSchema[nodeName].documentation}`
      );
    }

    return this.storages[nodeName];
  }
};
