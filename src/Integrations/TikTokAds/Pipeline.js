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
      // Getting advertiser IDs by splitting the configuration value by commas or semicolons
      let advertiserIds = String(this.config.AdvertiserIDs.value || "").split(/[,;]\s*/);
      
      if (!advertiserIds || advertiserIds.length === 0 || (advertiserIds.length === 1 && !advertiserIds[0])) {
        this.config.logMessage("❌ No advertiser IDs specified. Please configure AdvertiserIDs parameter.");
        return;
      }

      // Getting an object of nodes whose fields array needs to be fetched from
      let objects = String(this.config.Objects.value || "").split(/[,;]\s*/);
      
      if (!objects || objects.length === 0 || (objects.length === 1 && !objects[0])) {
        this.config.logMessage("❌ No objects specified. Please configure Objects parameter.");
        return;
      }
      
      console.log("Objects to fetch:", objects);
      
      let timeSeriesNodes = {};
      let catalogNodes = {};
      
      // Categorize nodes into time-series and catalog types
      for (var i = 0; i < objects.length; i++) {
        let nodeName = objects[i].trim();
        
        // Skip empty node names
        if (!nodeName) continue;
        
        // Fix common naming issues
        if (nodeName === "advertisers") {
          nodeName = "advertiser";
          this.config.logMessage(`Converting 'advertisers' to 'advertiser' for API compatibility`);
        }
        
        // Get all available fields for this node - use empty array to get all fields
        let nodeFields = [];
        
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
        this.cleanupOldData();
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
          
          // Filter out data that might be too large for Google Sheets
          const MAX_FIELDS_PER_RECORD = 200; // Google Sheets has limits on cells per row
          
          // Filter out fields exceeding limits
          let filteredData = data.map(record => {
            const fieldCount = Object.keys(record).length;
            
            // If record has too many fields, trim it down
            if (fieldCount > MAX_FIELDS_PER_RECORD) {
              this.config.logMessage(`⚠️ Record has ${fieldCount} fields, trimming to ${MAX_FIELDS_PER_RECORD}`);
              
              // Keep only the most important fields
              let trimmedRecord = {};
              
              // First, ensure we keep the unique key fields
              if (this.connector.fieldsSchema[nodeName] && 
                  this.connector.fieldsSchema[nodeName].uniqueKeys) {
                for (const keyField of this.connector.fieldsSchema[nodeName].uniqueKeys) {
                  if (keyField in record) {
                    trimmedRecord[keyField] = record[keyField];
                  }
                }
              }
              
              // Then add other fields until we reach the limit
              const fieldsToAdd = Object.keys(record).filter(
                key => !(key in trimmedRecord)
              ).slice(0, MAX_FIELDS_PER_RECORD - Object.keys(trimmedRecord).length);
              
              for (const field of fieldsToAdd) {
                trimmedRecord[field] = record[field];
              }
              
              return trimmedRecord;
            }
            
            return record;
          });
          
          try {
            this.getStorageByNode(nodeName, fields).saveData(filteredData);
          } catch (storageError) {
            this.config.logMessage(`❌ Error saving data to storage: ${storageError.message}`);
            
            if (storageError.message.includes("columns are out of bounds")) {
              this.config.logMessage(`🔄 Trying with reduced field set...`);
              
              // Further reduce fields to only essential ones
              filteredData = filteredData.map(record => {
                const essentialRecord = {};
                
                // Keep only the unique key fields and a few basic fields
                if (this.connector.fieldsSchema[nodeName] && 
                    this.connector.fieldsSchema[nodeName].uniqueKeys) {
                  for (const keyField of this.connector.fieldsSchema[nodeName].uniqueKeys) {
                    if (keyField in record) {
                      essentialRecord[keyField] = record[keyField];
                    } else if (keyField === 'advertiser_id') {
                      // Ensure advertiser_id is always present
                      essentialRecord['advertiser_id'] = advertiserId;
                    }
                  }
                }
                
                // Add a few common fields if they exist
                const commonFields = ['name', 'status', 'create_time', 'modify_time'];
                for (const field of commonFields) {
                  if (field in record) {
                    essentialRecord[field] = record[field];
                  }
                }
                
                return essentialRecord;
              });
              
              this.getStorageByNode(nodeName, fields).saveData(filteredData);
            } else if (storageError.message.includes("value is required for Unique Key")) {
              this.config.logMessage(`🔄 Missing unique key field, adding required fields...`);
              
              // Find the missing key field
              const missingKeyMatch = storageError.message.match(/'([^']+)' value is required/);
              const missingKey = missingKeyMatch ? missingKeyMatch[1] : null;
              
              // Add missing fields to all records
              if (missingKey) {
                this.config.logMessage(`Adding missing key field: ${missingKey}`);
                
                filteredData = filteredData.map(record => {
                  if (!(missingKey in record)) {
                    // Use the appropriate value based on the field
                    if (missingKey === 'advertiser_id') {
                      record[missingKey] = advertiserId;
                    }
                  }
                  return record;
                });
                
                this.getStorageByNode(nodeName, fields).saveData(filteredData);
              } else {
                throw storageError; // Re-throw if we can't determine the missing key
              }
            } else {
              throw storageError; // Re-throw if it's another type of error
            }
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
            if (!data.length) {
              if (daysShift == 0) {
                this.config.logMessage(`ℹ️ No records have been fetched`);
              }
            } else {
              this.config.logMessage(`${data.length} records were fetched`);
              
              // Filter out data that might be too large for Google Sheets
              const MAX_FIELDS_PER_RECORD = 200; // Google Sheets has limits on cells per row
              
              // Filter out fields exceeding limits
              let filteredData = data.map(record => {
                const fieldCount = Object.keys(record).length;
                
                // If record has too many fields, trim it down
                if (fieldCount > MAX_FIELDS_PER_RECORD) {
                  this.config.logMessage(`⚠️ Record has ${fieldCount} fields, trimming to ${MAX_FIELDS_PER_RECORD}`);
                  
                  // Keep only the most important fields
                  let trimmedRecord = {};
                  
                  // First, ensure we keep the unique key fields
                  if (this.connector.fieldsSchema[nodeName] && 
                      this.connector.fieldsSchema[nodeName].uniqueKeys) {
                    for (const keyField of this.connector.fieldsSchema[nodeName].uniqueKeys) {
                      if (keyField in record) {
                        trimmedRecord[keyField] = record[keyField];
                      }
                    }
                  }
                  
                  // Then add other fields until we reach the limit
                  const fieldsToAdd = Object.keys(record).filter(
                    key => !(key in trimmedRecord)
                  ).slice(0, MAX_FIELDS_PER_RECORD - Object.keys(trimmedRecord).length);
                  
                  for (const field of fieldsToAdd) {
                    trimmedRecord[field] = record[field];
                  }
                  
                  return trimmedRecord;
                }
                
                return record;
              });
              
              try {
                this.getStorageByNode(nodeName, timeSeriesNodes[nodeName]).saveData(filteredData);
              } catch (storageError) {
                this.config.logMessage(`❌ Error saving data to storage: ${storageError.message}`);
                
                if (storageError.message.includes("columns are out of bounds")) {
                  this.config.logMessage(`🔄 Trying with reduced field set...`);
                  
                  // Further reduce fields to only essential ones
                  filteredData = filteredData.map(record => {
                    const essentialRecord = {};
                    
                    // Keep only the unique key fields and a few basic fields
                    if (this.connector.fieldsSchema[nodeName] && 
                        this.connector.fieldsSchema[nodeName].uniqueKeys) {
                      for (const keyField of this.connector.fieldsSchema[nodeName].uniqueKeys) {
                        if (keyField in record) {
                          essentialRecord[keyField] = record[keyField];
                        } else if (keyField === 'advertiser_id') {
                          // Ensure advertiser_id is always present
                          essentialRecord['advertiser_id'] = advertiserId;
                        }
                      }
                    }
                    
                    // For insights, prioritize important metrics
                    if (nodeName === 'ad_insights') {
                      const priorityFields = [
                        'date_start', 'stat_time_day', 'advertiser_id', 'campaign_id', 
                        'adgroup_id', 'ad_id', 'impressions', 'clicks', 'spend', 
                        'conversions', 'ctr', 'cpc', 'cpm'
                      ];
                      
                      for (const field of priorityFields) {
                        if (field in record) {
                          essentialRecord[field] = record[field];
                        } else if (field === 'advertiser_id') {
                          // Ensure advertiser_id is always present
                          essentialRecord['advertiser_id'] = advertiserId;
                        }
                      }
                    }
                    
                    return essentialRecord;
                  });
                  
                  this.getStorageByNode(nodeName, timeSeriesNodes[nodeName]).saveData(filteredData);
                } else if (storageError.message.includes("value is required for Unique Key")) {
                  this.config.logMessage(`🔄 Missing unique key field, adding required fields...`);
                  
                  // Find the missing key field
                  const missingKeyMatch = storageError.message.match(/'([^']+)' value is required/);
                  const missingKey = missingKeyMatch ? missingKeyMatch[1] : null;
                  
                  // Add missing fields to all records
                  if (missingKey) {
                    this.config.logMessage(`Adding missing key field: ${missingKey}`);
                    
                    filteredData = filteredData.map(record => {
                      if (!(missingKey in record)) {
                        // Use the appropriate value based on the field
                        if (missingKey === 'advertiser_id') {
                          record[missingKey] = advertiserId;
                        } else if (missingKey === 'stat_time_day' && 'date_start' in record) {
                          record[missingKey] = record['date_start'];
                        }
                      }
                      return record;
                    });
                    
                    this.getStorageByNode(nodeName, timeSeriesNodes[nodeName]).saveData(filteredData);
                  } else {
                    throw storageError; // Re-throw if we can't determine the missing key
                  }
                } else {
                  throw storageError; // Re-throw if it's another type of error
                }
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
      
      // Special handling for ad_insights - adjust uniqueKeys based on data_level
      if (nodeName === 'ad_insights') {
        const dataLevel = this.config.DataLevel && this.config.DataLevel.value ? 
                        this.config.DataLevel.value : "AUCTION_AD";
                        
        // Validate data level
        const validDataLevels = ["AUCTION_ADVERTISER", "AUCTION_CAMPAIGN", "AUCTION_ADGROUP", "AUCTION_AD"];
        if (!validDataLevels.includes(dataLevel)) {
          this.config.logMessage(`⚠️ Invalid data_level: ${dataLevel}. Using default AUCTION_AD uniqueKeys.`);
        } else {
          // Adjust uniqueKeys based on data level
          switch (dataLevel) {
            case "AUCTION_ADVERTISER":
              uniqueFields = ["advertiser_id", "stat_time_day"];
              break;
            case "AUCTION_CAMPAIGN":
              uniqueFields = ["advertiser_id", "campaign_id", "stat_time_day"];
              break;
            case "AUCTION_ADGROUP":
              uniqueFields = ["advertiser_id", "adgroup_id", "stat_time_day"];
              break;
            case "AUCTION_AD":
            default:
              uniqueFields = ["advertiser_id", "ad_id", "stat_time_day"];
              break;
          }
          this.config.logMessage(`Using uniqueKeys for ${dataLevel} data level: ${uniqueFields.join(", ")}`);
        }
      }

      this.storages[ nodeName ] = new globalThis[ this.storageName ](
        this.config.mergeParameters({ 
          DestinationSheetName: {value: nodeName},
          DestinationTableName: {value: this.config.DestinationTableNamePrefix.value + nodeName.replace(/[^a-zA-Z0-9_]/g, "_") }
        }),
        uniqueFields,
        this.connector.fieldsSchema[ nodeName ]["fields"],
        `${this.connector.fieldsSchema[ nodeName ]["description"]} ${this.connector.fieldsSchema[ nodeName ]["documentation"]}`
      );
    }

    return this.storages[nodeName];
  }
  
  /**
   * Clean up old data based on CleanUpToKeepWindow configuration
   */
  cleanupOldData() {
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