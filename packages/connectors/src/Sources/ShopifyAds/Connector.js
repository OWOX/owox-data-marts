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
      await this._processCatalogNode({
        nodeName,
        fields: fields[nodeName] || []
      });
    }
  }

  /**
   * Process catalog node (marketing events).
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

