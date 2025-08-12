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
startImportProcess() {

  let startDate = null;
  let daysToFetch = null;
  [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

  // start requesting data day by day from startDate to startDate + MaxFetchingDays
  for(var daysShift = 0; daysShift < daysToFetch; daysShift++) {

    // fetching new data from a data source  
            let data = this.source.fetchData(startDate);

    // there are fetched records to update
    if( !data.length ) {      
      
      if( daysShift == 0) {
        this.config.logMessage("ℹ️ No records have been fetched");
      }

    } else {

      this.config.logMessage(`${data.length} rows were fetched`);
      this.getStorageByNode("historical").saveData(data);

    }

    if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
      this.config.updateLastRequstedDate(startDate);
    }
    startDate.setDate( startDate.getDate() + 1);  // let's move on to the next date

  }    

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

      this.config.addParameter("DestinationTableName", { value: this.source.fieldsSchema[nodeName].destinationName }, false);

      this.storages[ nodeName ] = new globalThis[ this.storageName ]( 
        this.config.mergeParameters({ 
          DestinationSheetName: {value: this.source.fieldsSchema[nodeName].destinationName},
        }),
        uniqueFields,
        this.source.fieldsSchema[ nodeName ]["fields"],
        `${this.source.fieldsSchema[ nodeName ]["description"]} ${this.source.fieldsSchema[ nodeName ]["documentation"]}`
      );

    }

    return this.storages[ nodeName ];

  }


}