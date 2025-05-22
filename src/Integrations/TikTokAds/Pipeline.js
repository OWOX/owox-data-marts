/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var TikTokAdsPipeline = class TikTokAdsPipeline extends AbstractPipeline {

  constructor(config, connector, storageName="GoogleBigQueryStorage") {
    super(config.mergeParameters({
      DestinationTableNamePrefix: {
        default: ""
      }
    }),
    connector);

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
        if (!this.connector.fieldsSchema || !this.connector.fieldsSchema[nodeName]) {
          this.config.logMessage(`⚠️ Unknown object type: ${nodeName}. Skipping.`);
          continue;
        }
        
        // Node's data is time-series if it has a date_start field in its schema
        if ("fields" in this.connector.fieldsSchema[nodeName] &&
            ("date_start" in this.connector.fieldsSchema[nodeName]["fields"] ||
             "stat_time_day" in this.connector.fieldsSchema[nodeName]["fields"])) {
          
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
          // Determine date range based on configuration
          const dateRangeResult = this.getDateRange();
          if (!dateRangeResult || dateRangeResult.length < 3) {
            this.config.logMessage("❌ Failed to determine date range. Skipping time series data import.");
            return;
          }
          
          const [startDate, endDate, daysToFetch] = dateRangeResult;
          
          if (!startDate || isNaN(startDate.getTime())) {
            this.config.logMessage("❌ Invalid start date. Skipping time series data import.");
            return;
          }
          
          if (daysToFetch <= 0) {
            this.config.logMessage("⚠️ Days to fetch is zero or negative. Skipping time series data import.");
            return;
          }
          
          this.startImportProcessOfTimeSeriesData(advertiserIds, timeSeriesNodes, startDate, endDate, daysToFetch);
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
   * Determines the date range for data import based on configuration
   * Uses StartDate and EndDate if provided, otherwise falls back to lookback window
   * 
   * @return {Array} - [startDate, endDate, daysToFetch] tuple
   */
  getDateRange() {
    try {
      let startDate, endDate, daysToFetch;
      
      // Check if custom date range is specified
      const hasStartDate = this.config.StartDate && this.config.StartDate.value;
      const hasEndDate = this.config.EndDate && this.config.EndDate.value;
      
      if (hasStartDate) {
        // Parse start date from configuration
        try {
          startDate = new Date(this.config.StartDate.value);
          if (isNaN(startDate.getTime())) {
            throw new Error("Invalid date format");
          }
        } catch (error) {
          this.config.logMessage(`⚠️ Invalid StartDate format: ${this.config.StartDate.value}. Using default date range.`);
          const [defaultStartDate, defaultDaysToFetch] = this.getStartDateAndDaysToFetch();
          return [defaultStartDate, null, defaultDaysToFetch];
        }
        
        // Parse end date from configuration or use current date
        if (hasEndDate) {
          try {
            endDate = new Date(this.config.EndDate.value);
            if (isNaN(endDate.getTime())) {
              throw new Error("Invalid date format");
            }
          } catch (error) {
            this.config.logMessage(`⚠️ Invalid EndDate format: ${this.config.EndDate.value}. Using current date as end date.`);
            endDate = new Date(); // Today
          }
        } else {
          endDate = new Date(); // Today if not specified
        }
        
        // Calculate days between start and end dates
        const diffTime = Math.abs(endDate - startDate);
        daysToFetch = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates
        
        // Check if dates are in the correct order
        if (startDate > endDate) {
          this.config.logMessage("⚠️ StartDate is after EndDate. Swapping dates.");
          [startDate, endDate] = [endDate, startDate];
        }
        
        // Limit to max fetching days if needed
        const maxDays = this.config.MaxFetchingDays && this.config.MaxFetchingDays.value ? 
                       parseInt(this.config.MaxFetchingDays.value, 10) : 31;
        if (daysToFetch > maxDays) {
          this.config.logMessage(`⚠️ Date range exceeds maximum ${maxDays} days. Limiting to the first ${maxDays} days.`);
          daysToFetch = maxDays;
        }
        
      } else {
        // Use default date range based on reimport lookback window
        try {
          [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + daysToFetch - 1);
        } catch (error) {
          // Fallback to safe defaults if getStartDateAndDaysToFetch fails
          this.config.logMessage(`⚠️ Error calculating date range: ${error.message}. Using past 7 days as fallback.`);
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
          daysToFetch = 7;
          endDate = new Date();
        }
      }
      
      return [startDate, endDate, daysToFetch];
    } catch (error) {
      // Final fallback - if anything fails, use the past 7 days
      this.config.logMessage(`⚠️ Unexpected error in getDateRange: ${error.message}. Using past 7 days as fallback.`);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();
      return [startDate, endDate, 7];
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
        let data = this.connector.fetchData(nodeName, advertiserId, fields);
        
        if (data.length) {
          this.config.logMessage(`${data.length} rows of ${nodeName} were fetched for advertiser ${advertiserId}`);

          try {
            this.getStorageByNode(nodeName, fields).saveData(data);
          } catch (storageError) {
            this.config.logMessage(`❌ Error saving data to storage: ${storageError.message}`);
            console.error(`Error details: ${storageError.stack}`);
          }
        } else {
          this.config.logMessage(`No rows of ${nodeName} were fetched for advertiser ${advertiserId}`);
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
   * @param {Date} endDate - End date
   * @param {number} daysToFetch - Days to import
   */
  startImportProcessOfTimeSeriesData(advertiserIds, timeSeriesNodes, startDate, endDate, daysToFetch = 1) {
    // Start requesting data day by day from startDate to startDate + daysToFetch
    for (var daysShift = 0; daysShift < daysToFetch; daysShift++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + daysShift);
      
      // Don't fetch data beyond end date
      if (endDate && currentDate > endDate) {
        break;
      }
      
      const formattedDate = Utilities.formatDate(currentDate, "UTC", "yyyy-MM-dd");
      
      this.config.logMessage(`Processing data for date: ${formattedDate}`);
      
      // Iterating through advertisers
      for (let advertiserId of advertiserIds) {
        // Iterating through nodes to fetch data
        for (var nodeName in timeSeriesNodes) {
          try {
            this.config.logMessage(`Start importing data for ${formattedDate}: ${advertiserId}/${nodeName}`);

            // Fetching new data from the data source
            let data = this.connector.fetchData(nodeName, advertiserId, timeSeriesNodes[nodeName], currentDate);

            // Process fetched records
            if (!data.length && daysShift == 0) {
              this.config.logMessage(`ℹ️ No records have been fetched`);
            } else {
              this.config.logMessage(`${data.length} records were fetched`);
              try {
                this.getStorageByNode(nodeName, timeSeriesNodes[nodeName]).saveData(data);
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

      this.config.updateLastRequstedDate(currentDate);
    }
  }

  /**
   * Get storage instance for a node
   * 
   * @param {string} nodeName - Name of the node
   * @param {array} requestedFields - List of requested fields
   * @return {AbstractStorage} - Storage instance
   */
  getStorageByNode(nodeName, requestedFields) {
    // Initialize blank object for storages
    if (!("storages" in this)) {
      this.storages = {};
    }

    if (!(nodeName in this.storages)) {
      if (!("uniqueKeys" in this.connector.fieldsSchema[nodeName])) {
        throw new Error(`Unique keys for '${nodeName}' are not defined in fields schema`);
      }

      let uniqueFields = this.connector.fieldsSchema[nodeName]["uniqueKeys"];

      // Create storage instance (Google Sheets is the default storage)
      this.storages[nodeName] = new globalThis[ this.storageName ](
        this.config.mergeParameters({ 
          DestinationSheetName: { value: nodeName },
          DestinationTableName: {value: this.config.DestinationTableNamePrefix.value + nodeName},
          currentValues: { 
            // Pass any values that might be needed for default values
            advertiser_id: this.connector.currentAdvertiserId
          }
        }),
        uniqueFields,
        this.connector.fieldsSchema[nodeName]["fields"] || {},
        `${this.connector.fieldsSchema[ nodeName ]["description"]} ${this.connector.fieldsSchema[ nodeName ]["documentation"]}`
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
    const formattedCutoffDate = Utilities.formatDate(cutoffDate, "UTC", "yyyy-MM-dd");
    
    // Initialize storages for all time series nodes
    for (var nodeName in this.connector.fieldsSchema) {
      // Check if it's a time series node
      if ("fields" in this.connector.fieldsSchema[nodeName] &&
          ("date_start" in this.connector.fieldsSchema[nodeName]["fields"] ||
           "stat_time_day" in this.connector.fieldsSchema[nodeName]["fields"])) {
        
        try {
          const storage = this.getStorageByNode(nodeName, []);
          
          // For Google Sheets storage, we need to manually find and delete old records
          if (storage instanceof GoogleSheetsStorage) {
            // Get the date field name
            const dateField = this.connector.fieldsSchema[nodeName]["fields"]["date_start"] ? 
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

  /**
   * Gets the start date and days to fetch based on the last requested date and lookback window
   * 
   * @return {Array} - [startDate, daysToFetch] tuple
   */
  getStartDateAndDaysToFetch() {
    try {
      // Default to reimport window of 2 days if not specified
      const lookbackWindow = this.config.ReimportLookbackWindow && this.config.ReimportLookbackWindow.value ? 
                            parseInt(this.config.ReimportLookbackWindow.value) : 2;
      
      // Default to fetching 30 days if not specified
      const maxFetchingDays = this.config.MaxFetchingDays && this.config.MaxFetchingDays.value ? 
                             parseInt(this.config.MaxFetchingDays.value) : 30;
      
      // Try to get the last requested date from the config
      let lastRequestedDate = null;
      if (this.config.LastRequestedDate && this.config.LastRequestedDate.value) {
        try {
          lastRequestedDate = new Date(this.config.LastRequestedDate.value);
          if (isNaN(lastRequestedDate.getTime())) {
            this.config.logMessage("⚠️ Invalid LastRequestedDate format. Using current date minus lookback window.");
            lastRequestedDate = null;
          }
        } catch (error) {
          this.config.logMessage(`⚠️ Error parsing LastRequestedDate: ${error.message}. Using current date minus lookback window.`);
          lastRequestedDate = null;
        }
      }
      
      // If we have a valid last requested date, use it minus lookback window
      // Otherwise, fetch from current date minus maxFetchingDays
      let startDate;
      let daysToFetch;
      
      if (lastRequestedDate) {
        // Start from the last requested date minus lookback window
        startDate = new Date(lastRequestedDate);
        startDate.setDate(startDate.getDate() - lookbackWindow);
        
        // Calculate days between last requested date and start date
        const currentDate = new Date();
        const diffTime = Math.abs(currentDate - startDate);
        daysToFetch = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include start date
        
        // Cap the days to fetch by maxFetchingDays
        if (daysToFetch > maxFetchingDays) {
          this.config.logMessage(`⚠️ Days to fetch (${daysToFetch}) exceeds MaxFetchingDays (${maxFetchingDays}). Limiting to ${maxFetchingDays} days.`);
          startDate = new Date();
          startDate.setDate(startDate.getDate() - maxFetchingDays + 1);
          daysToFetch = maxFetchingDays;
        }
      } else {
        // No last requested date, fetch from current date minus maxFetchingDays
        startDate = new Date();
        startDate.setDate(startDate.getDate() - maxFetchingDays + 1);
        daysToFetch = maxFetchingDays;
      }
      
      return [startDate, daysToFetch];
    } catch (error) {
      // Fallback to safe defaults if any error occurs
      this.config.logMessage(`⚠️ Error calculating date range: ${error.message}. Using past 7 days as fallback.`);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      return [startDate, 7];
    }
  }
}; 