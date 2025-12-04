/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var ShopifyAdsConnector = class ShopifyAdsConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleBigQueryStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  /**
   * Import entry point for Shopify Ads.
   */
  async startImportProcess() {
    const fields = ConnectorUtils.parseFields(this.config.Fields.value);

    for (const nodeName in fields) {
      const schema = this.source.fieldsSchema[nodeName];
      const isTimeSeries = schema?.isTimeSeries || false;

      if (isTimeSeries) {
        await this._processTimeSeriesNode({
          nodeName,
          fields: fields[nodeName] || []
        });
      } else {
        await this._processCatalogNode({
          nodeName,
          fields: fields[nodeName] || []
        });
      }
    }
  }

  /**
   * Process time series node (orders, customers, products, etc.).
   * Fetches data incrementally based on date range.
   * @param {Object} options
   * @param {string} options.nodeName
   * @param {Array<string>} options.fields
   * @returns {Promise<void>}
   * @private
   */
  async _processTimeSeriesNode({ nodeName, fields }) {
    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

    if (daysToFetch <= 0) {
      this.config.logMessage(`No days to fetch for ${nodeName}`);
      return;
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysToFetch - 1);

    const startDateStr = DateUtils.formatDate(startDate);
    const endDateStr = DateUtils.formatDate(endDate);

    this.config.logMessage(`Fetching ${nodeName} from ${startDateStr} to ${endDateStr}`);

    const data = await this.source.fetchData({
      nodeName,
      fields,
      startDate: startDateStr,
      endDate: endDateStr
    });

    const storage = await this.getStorageByNode(nodeName);

    if (data.length || this.config.CreateEmptyTables?.value) {
      const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
      await storage.saveData(preparedData);
    }

    this.config.logMessage(
      data.length ?
        `${data.length} rows of ${nodeName} were fetched` :
        `No records have been fetched`
    );

    if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
      this.config.updateLastRequstedDate(endDate);
    }
  }

  /**
   * Process catalog node (static data like shop, blogs, etc.).
   * @param {Object} options
   * @param {string} options.nodeName
   * @param {Array<string>} options.fields
   * @returns {Promise<void>}
   * @private
   */
  async _processCatalogNode({ nodeName, fields }) {
    const data = await this.source.fetchData({
      nodeName,
      fields
    });

    const storage = await this.getStorageByNode(nodeName);

    if (data.length || this.config.CreateEmptyTables?.value) {
      const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
      await storage.saveData(preparedData);
    }

    this.config.logMessage(
      data.length ?
        `${data.length} rows of ${nodeName} were fetched` :
        `No records have been fetched`
    );
  }

  /**
   * Lazy storage init per node.
   * @param {string} nodeName
   * @returns {Promise<AbstractStorage>}
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

