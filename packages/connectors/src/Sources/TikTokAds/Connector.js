/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var TikTokAdsConnector = class TikTokAdsConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleSheetsStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  startImportProcess() {
    try {
      let advertiserIds = TikTokAdsHelper.parseAdvertiserIds(this.config.AdvertiserIDs.value || "");
      
      if (!advertiserIds || advertiserIds.length === 0) {
        this.config.logMessage("❌ No advertiser IDs specified. Please configure AdvertiserIDs parameter.");
        return;
      }

      // Parse fields from the config
      let fields = TikTokAdsHelper.parseFields(this.config.Fields.value || "");
      let timeSeriesNodes = {};
      let catalogNodes = {};
      
      // Categorize nodes into time-series and catalog types
      for (const nodeName in fields) {
        // Skip empty node names
        if (!nodeName) continue;
        
        // Get fields for this node
        let nodeFields = fields[nodeName];
        
        // Ensure schema exists for this node
        if (!this.source.fieldsSchema || !this.source.fieldsSchema[nodeName]) {
          this.config.logMessage(`⚠️ Unknown object type: ${nodeName}. Skipping.`);
          continue;
        }
        
        // Node's data is time-series if it has a date_start field in its schema
        if ("fields" in this.source.fieldsSchema[nodeName] &&
            ("date_start" in this.source.fieldsSchema[nodeName]["fields"] ||
             "stat_time_day" in this.source.fieldsSchema[nodeName]["fields"])) {
          
          timeSeriesNodes[nodeName] = nodeFields;
        } else {
          // Node's data is catalog-like, it must be imported right away
          catalogNodes[nodeName] = nodeFields;
        }
      }

      // First fetch catalog data (entities like advertiser, campaigns, etc.)
      if (Object.keys(catalogNodes).length > 0) {
        this.importCatalogData(catalogNodes, advertiserIds);
      }

      // Then import time-series data (performance metrics)
      if (Object.keys(timeSeriesNodes).length > 0) {
        try {
          const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

          if (!startDate) {
            this.config.logMessage("❌ There is nothing to import in this data range");
            return;
          }
          
          this.startImportProcessOfTimeSeriesData(advertiserIds, timeSeriesNodes, startDate, daysToFetch);
        } catch (error) {
          this.config.logMessage(`❌ Error determining date range: ${error.message}`);
          console.error(error.stack);
        }
      }
      
      // Clean up old data if configured
      try {
        this.cleanUpExpiredData();
      } catch (error) {
        this.config.logMessage(`❌ Error during data cleanup: ${error.message}`);
        console.error(error.stack);
      }
    } catch (error) {
      this.config.logMessage(`❌ Error during import process: ${error.message}`);
      console.error(error.stack);
    }
  }

  /**
   * Imports all catalog (non-time-series) data types
   * 
   * @param {object} catalogNodes - Object with node names as keys and field arrays as values
   * @param {array} advertiserIds - List of advertiser IDs to fetch data for
   */
  importCatalogData(catalogNodes, advertiserIds) {
    for (var nodeName in catalogNodes) {
      this.config.logMessage(`Starting import for ${nodeName} data...`);
      this.startImportProcessOfCatalogData(nodeName, advertiserIds, catalogNodes[nodeName]);
    }
  }

  /**
   * Imports catalog (not time series) data
   * 
   * @param {string} nodeName - Node name
   * @param {array} advertiserIds - List of advertiser IDs
   * @param {array} fields - List of fields
   */
  startImportProcessOfCatalogData(nodeName, advertiserIds, fields) {
    this.config.logMessage(`Fetching all available fields for ${nodeName}`);
    
    for (var i in advertiserIds) {
      let advertiserId = advertiserIds[i];
      
      try {
        let data = this.source.fetchData(nodeName, advertiserId, fields);
        
        this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for advertiser ${advertiserId}` : `ℹ️ No records have been fetched`);

        if (data.length || this.config.CreateEmptyTables?.value === "true") {
          try {
            const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
            this.getStorageByNode(nodeName).saveData(preparedData);
          } catch (storageError) {
            this.config.logMessage(`❌ Error saving data to storage: ${storageError.message}`);
            console.error(`Error details: ${storageError.stack}`);
          }
        }
      } catch (error) {
        this.config.logMessage(`❌ Error fetching ${nodeName} for advertiser ${advertiserId}: ${error.message}`);
        console.error(`Error details: ${error.stack}`);
        // Continue with other advertisers rather than stopping the whole process
      }
    }
  }

  /**
   * Imports time series data
   * 
   * @param {array} advertiserIds - List of advertiser IDs
   * @param {object} timeSeriesNodes - Object of properties, each is array of fields
   * @param {Date} startDate - Start date
   * @param {number} daysToFetch - Number of days to fetch
   */
  startImportProcessOfTimeSeriesData(advertiserIds, timeSeriesNodes, startDate, daysToFetch) {
    // Start requesting data day by day from startDate to startDate + daysToFetch
    for (var daysShift = 0; daysShift < daysToFetch; daysShift++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + daysShift);
      
      const formattedDate = EnvironmentAdapter.formatDate(currentDate, "UTC", "yyyy-MM-dd");
      
      this.config.logMessage(`Processing data for date: ${formattedDate}`);
      
      // Iterating through advertisers
      for (let advertiserId of advertiserIds) {
        // Iterating through nodes to fetch data
        for (var nodeName in timeSeriesNodes) {
          try {
            this.config.logMessage(`Start importing data for ${formattedDate}: ${advertiserId}/${nodeName}`);

            // Fetching new data from the data source
            let data = this.source.fetchData(nodeName, advertiserId, timeSeriesNodes[nodeName], currentDate);

            this.config.logMessage(data.length ? `${data.length} records were fetched` : `ℹ️ No records have been fetched`);

            if (data.length || this.config.CreateEmptyTables?.value === "true") {
              try {
                const preparedData = data.length ? this.addMissingFieldsToData(data, timeSeriesNodes[nodeName]) : data;
                this.getStorageByNode(nodeName).saveData(preparedData);
              } catch (storageError) {
                this.config.logMessage(`❌ Error saving data to storage: ${storageError.message}`);
                console.error(`Error details: ${storageError.stack}`);
              }
            }
          } catch (error) {
            this.config.logMessage(`❌ Error fetching ${nodeName} for advertiser ${advertiserId} on ${formattedDate}: ${error.message}`);
            console.error(`Error details: ${error.stack}`);
            // Continue with other nodes rather than stopping the whole process
          }
        }
      }

      if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(currentDate);
      }
    }
  }

  /**
   * Get storage instance for a node
   * 
   * @param {string} nodeName - Name of the node
   * @param {array} requestedFields - List of requested fields
   * @return {AbstractStorage} - Storage instance
   */
  getStorageByNode(nodeName) {
    // Initialize blank object for storages
    if (!("storages" in this)) {
      this.storages = {};
    }

    if (!(nodeName in this.storages)) {
      if (!("uniqueKeys" in this.source.fieldsSchema[nodeName])) {
        throw new Error(`Unique keys for '${nodeName}' are not defined in fields schema`);
      }

      let uniqueFields = this.source.fieldsSchema[nodeName]["uniqueKeys"];

      // Create storage instance (Google Sheets is the default storage)
      this.storages[nodeName] = new globalThis[ this.storageName ](
        this.config.mergeParameters({ 
          DestinationSheetName: { value: this.source.fieldsSchema[nodeName].destinationName },
          DestinationTableName: { value: this.getDestinationName(nodeName, this.config, this.source.fieldsSchema[nodeName].destinationName) },
          currentValues: { 
            // Pass any values that might be needed for default values
            advertiser_id: this.source.currentAdvertiserId
          }
        }),
        uniqueFields,
        this.source.fieldsSchema[nodeName]["fields"] || {},
        `${this.source.fieldsSchema[ nodeName ]["description"]} ${this.source.fieldsSchema[ nodeName ]["documentation"]}`
      );
    }

    return this.storages[nodeName];
  }
  
  /**
   * Clean up old data based on CleanUpToKeepWindow configuration
   */
  cleanUpExpiredData() {
    // Check if cleanup window is configured
    if (!this.config.CleanUpToKeepWindow || !this.config.CleanUpToKeepWindow.value) {
      return;
    }
    
    const keepDays = parseInt(this.config.CleanUpToKeepWindow.value, 10);
    if (isNaN(keepDays) || keepDays <= 0) {
      return;
    }
    
    this.config.logMessage(`Cleaning up data older than ${keepDays} days...`);
    
    // Get cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    const formattedCutoffDate = EnvironmentAdapter.formatDate(cutoffDate, "UTC", "yyyy-MM-dd");
    
    // Initialize storages for all time series nodes
    for (var nodeName in this.source.fieldsSchema) {
      // Check if it's a time series node
      if ("fields" in this.source.fieldsSchema[nodeName] &&
          ("date_start" in this.source.fieldsSchema[nodeName]["fields"] ||
           "stat_time_day" in this.source.fieldsSchema[nodeName]["fields"])) {
        
        try {
          const storage = this.getStorageByNode(nodeName);
          
          // For Google Sheets storage, we need to manually find and delete old records
          if (storage instanceof GoogleSheetsStorage) {
            // Get the date field name
            const dateField = this.source.fieldsSchema[nodeName]["fields"]["date_start"] ? 
                             "date_start" : "stat_time_day";
            
            // Find records to delete
            let keysToDelete = [];
            for (const uniqueKey in storage.values) {
              const record = storage.values[uniqueKey];
              const rowDate = record[dateField];
              
              if (rowDate && rowDate < cutoffDate) {
                keysToDelete.push(uniqueKey);
              }
            }
            
            // Delete the old records
            let deletedCount = 0;
            for (const key of keysToDelete) {
              storage.deleteRecord(key);
              deletedCount++;
            }
            
            if (deletedCount > 0) {
              this.config.logMessage(`Deleted ${deletedCount} rows from ${nodeName} that were older than ${formattedCutoffDate}`);
            }
          }
        } catch (error) {
          this.config.logMessage(`❌ Error cleaning up old data from ${nodeName}: ${error.message}`);
          console.error(`Error details: ${error.stack}`);
        }
      }
    }
  }
};
