/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var GitHubConnector = class GitHubConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleSheetsStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  startImportProcess() {
    const fields = ConnectorUtils.parseFields(this.config.Fields.value);

    for (const nodeName in fields) {
      this.processNode({
        nodeName,
        fields: fields[nodeName] || []
      });
    }
  }

  /**
   * Process a single node
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node to process
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  processNode({ nodeName, fields }) {
    if (ConnectorUtils.isTimeSeriesNode(this.source.fieldsSchema[nodeName])) {
      this.processTimeSeriesNode({ nodeName, fields });
    } else {
      this.processCatalogNode({ nodeName, fields });
    }
  }

  /**
   * Process a time series node
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {Object} options.storage - Storage instance
   */
  processTimeSeriesNode({ nodeName, fields }) {
    // Placeholder for future time series nodes
    console.log(`Time series node processing not implemented for ${nodeName}`);
  }
  
  /**
   * Process a catalog node (repository, contributors, repositoryStats)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {Array<string>} options.fields - Array of fields to fetch
   * @param {Object} options.storage - Storage instance
   */
  processCatalogNode({ nodeName, fields }) {
    // Fetch data from GitHub API
    const data = this.source.fetchData({ nodeName, fields });

    this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched` : `No records have been fetched`);

    if (data.length || this.config.CreateEmptyTables?.value) {
      const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
      this.getStorageByNode(nodeName).saveData(preparedData);
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

}
