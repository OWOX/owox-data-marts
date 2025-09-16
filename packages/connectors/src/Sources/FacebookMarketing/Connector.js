/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var FacebookMarketingConnector = class FacebookMarketingConnector extends AbstractConnector {

  // ---- constructor ------------------------------------
      constructor(config, source, storageName = "GoogleSheetsStorage", runConfig = null) {
    
    super(config, source, null, runConfig);
    
    this.storageName = storageName;

    }


//---- startImportProcess -------------------------------------------------
    startImportProcess() {

      // Getting account IDs by splitting the configuration value by commas
      let accountsIds = String(this.config.AccoundIDs.value).split(/[,;]\s*/);

      // Getting an object of nodes whose fields array needs to be fetched from
      let fields = this.config.Fields.value.split(", ").reduce( (acc, pair) => {
        let [key, value] = pair.split(" ");
        (acc[key] = acc[key] || []).push( value.trim() );
        return acc;
      }, {});

      let timeSeriesNodes = {};
      
      // Data must be imported differently depending on whether it is time-series or not
      for(var nodeName in fields) {
        
        if( nodeName in this.source.fieldsSchema && this.source.fieldsSchema[nodeName].isTimeSeries ) {

            timeSeriesNodes[nodeName] = fields[nodeName];

        // node's data is catalog like, it must be imported right away
        } else {

          this.startImportProcessOfCatalogData(nodeName, accountsIds, fields[ nodeName ]);
        
        }

      }
    
      // if there are some time series nodes to import
      if( Object.keys(timeSeriesNodes).length > 0 ) {
        let startDate = null;
        let daysToFetch = null;
        [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

        if( daysToFetch > 0 ) {
          this.startImportProcessOfTimeSeriesData(accountsIds, timeSeriesNodes, startDate, daysToFetch);
        }
        
      }

      
    }
  
  //---- startImportProcessOfCatalogData -------------------------------------------------
    /*

    Imports catalog (not time seriesed) data 

    @param nodeName string Node name
    @param accountsIds array list of account ids
    @param fields array list of fields 

    */
    startImportProcessOfCatalogData(nodeName, accountIds, fields) {

      let totalRecords = 0;

      for(var i in accountIds) {
        
        let accountId = accountIds[i];

        let data = this.source.fetchData(nodeName, accountId, fields);
        
        if( data.length ) {
          this.config.logMessage(`${data.length} rows of ${nodeName} were fetched for account ${accountId}`);
          this.getStorageByNode(nodeName, fields ).saveData( data );
          totalRecords += data.length;
        }

      }

      // If no data was found but should create empty table
      if (totalRecords === 0 && this.config.CreateEmptyTables?.value === "true") {
        let storage = this.getStorageByNode(nodeName, fields);
        
        this.createEmptyTableStructure(nodeName, fields, storage);
      }

    }
  
  //---- startImportProcessOfTimeSeriesData -------------------------------------------------
    /*

    Imports time series (not catalog) data 

    @param accountsIds (array) list of account ids
    @param timeSeriesNodes (object) of properties, each is array of fields
    @param startDate (Data) start date 
    @param daysToFetch (integer) days to import

    */
    startImportProcessOfTimeSeriesData(accountsIds, timeSeriesNodes, startDate, daysToFetch = 1) {

      // Track which nodes had data across all days/accounts
      const nodesWithData = new Set();

      // start requesting data day by day from startDate to startDate + MaxFetchingDays
      for(var daysShift = 0; daysShift < daysToFetch; daysShift++) {

      //this.config.logMessage(`Start importing data for ${EnvironmentAdapter.formatDate(startDate, "UTC", "yyyy-MM-dd")}`);

        // itterating accounts  
        for (let accountId of accountsIds) {

          //this.config.logMessage(`Start importing data for ${EnvironmentAdapter.formatDate(startDate, "UTC", "yyyy-MM-dd")}: ${accountId}`);
        
          // itteration nodes to fetch data
          for(var nodeName in timeSeriesNodes) {
            
            this.config.logMessage(`Start importing data for ${EnvironmentAdapter.formatDate(startDate, "UTC", "yyyy-MM-dd")}: ${accountId}/${nodeName}`);

            // fetching new data from a data source  
            let data = this.source.fetchData(nodeName, accountId, timeSeriesNodes[ nodeName ], startDate);

              // there are fetched records to update
            if( !data.length ) {      
              
              if( daysShift == 0) {
                this.config.logMessage(`ℹ️ No records have been fetched`);
              }

            } else {

              this.config.logMessage(`${data.length} records were fetched`);
              this.getStorageByNode(nodeName, timeSeriesNodes[ nodeName ] ).saveData(data);
              nodesWithData.add(nodeName);

            }
            
          }
        
        }

        // Only update LastRequestedDate for incremental runs
        if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
          this.config.updateLastRequstedDate(startDate);
        }
        startDate.setDate( startDate.getDate() + 1);  // let's move on to the next date

      }

      // Create empty tables for nodes that had no data if required
      if (this.config.CreateEmptyTables?.value === "true") {
        for (let nodeName in timeSeriesNodes) {
          if (!nodesWithData.has(nodeName)) {
            let storage = this.getStorageByNode(nodeName, timeSeriesNodes[nodeName]);
            
            this.createEmptyTableStructure(nodeName, timeSeriesNodes[nodeName], storage);
          }
        }
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

      this.storages[ nodeName ] = new globalThis[ this.storageName ]( 
        this.config.mergeParameters({ 
          DestinationSheetName: {value: this.source.fieldsSchema[nodeName].destinationName },
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