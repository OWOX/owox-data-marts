/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var OpenExchangeRatesConnector = class OpenExchangeRatesConnector extends AbstractConnector {

  constructor(config, source, storageName = "GoogleSheetsStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

/*

A method for invoking importNewData() to determine the parameters required for fetching new data

*/
  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  startImportProcess() {
    const fields = ConnectorUtils.parseFields(this.config.Fields?.value);

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
    if (this.source.fieldsSchema[nodeName].isTimeSeries) {
      this.processTimeSeriesNode({ nodeName, fields });
    } else {
      this.processCatalogNode({ nodeName, fields });
    }
  }

  /**
   * Process a time series node (historical exchange rates)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  processTimeSeriesNode({ nodeName, fields }) {
    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

    if (daysToFetch <= 0) {
      console.log('No days to fetch for time series data');
      return;
    }

    // Process data day by day
    for (let daysShift = 0; daysShift < daysToFetch; daysShift++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + daysShift);

      // Fetching new data from a data source  
      let data = this.source.fetchData(currentDate);

      this.config.logMessage(data.length ? `${data.length} rows were fetched` : `No records have been fetched`);

      if (data.length || this.config.CreateEmptyTables?.value) {
        const preparedData = data.length ? data : [];
        this.getStorageByNode(nodeName).saveData(preparedData);
      }

      if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(currentDate);
      }
    }
  }

  /**
   * Process a catalog node (placeholder for future use)
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  processCatalogNode({ nodeName, fields }) {
    // Placeholder for future catalog nodes
    console.log(`Catalog node processing not implemented for ${nodeName}`);
  }

//---- getStorageName -------------------------------------------------
  /**
   *
   * @param nodeName string name of the node
   * @param requestedFields array list of requested fields
   * 
   * @return AbstractStorage 
   * 
   */
  getStorageByNode(nodeName) {

    // initiate blank object for storages
    if( !("storages" in this) ) {
      this.storages = {};
    }

    if( !(nodeName in this.storages) ) {

      if( !("uniqueKeys" in this.source.fieldsSchema[ nodeName ]) ) {
        throw new Error(`Unique keys for '${nodeName}' are not defined in the fields schema`);
      }

      let uniqueFields = this.source.fieldsSchema[ nodeName ]["uniqueKeys"];

      this.storages[ nodeName ] = new globalThis[ this.storageName ]( 
        this.config.mergeParameters({ 
          DestinationSheetName: { value: this.source.fieldsSchema[nodeName].destinationName},
          DestinationTableName: { value: this.getDestinationName(nodeName, this.config, this.source.fieldsSchema[nodeName].destinationName) },
        }),
        uniqueFields,
        this.source.fieldsSchema[ nodeName ]["fields"],
        `${this.source.fieldsSchema[ nodeName ]["description"]} ${this.source.fieldsSchema[ nodeName ]["documentation"]}`
      );

    }

    return this.storages[ nodeName ];

  }


}