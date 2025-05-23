/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var TikTokAdsConnector = class TikTokAdsConnector extends AbstractConnector {

  constructor(config) {
    super(config.mergeParameters({
      AccessToken: {
        isRequired: true,
        requiredType: "string",
      },
      AppId: {
        requiredType: "string",
      },
      AppSecret: {
        requiredType: "string",
      },
      AdvertiserIDs: {
        isRequired: true,
      },
      DataLevel: {
        requiredType: "string", 
        default: "AUCTION_AD",
        description: "Data level for ad_insights reports (AUCTION_ADVERTISER, AUCTION_CAMPAIGN, AUCTION_ADGROUP, AUCTION_AD)"
      },
      StartDate: {
        requiredType: "date",
        description: "Start date for data import in YYYY-MM-DD format"
      },
      EndDate: {
        requiredType: "date",
        description: "End date for data import in YYYY-MM-DD format"
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2
      },
      CleanUpToKeepWindow: {
        requiredType: "number"
      },
      MaxFetchingDays: {
        requiredType: "number",
        isRequired: true,
        default: 31
      },
      IncludeDeleted: {
        requiredType: "bool",
        default: false,
        description: "Include deleted entities in results"
      },
      SandboxMode: {
        requiredType: "bool",
        default: false,
        description: "Use sandbox environment for testing"
      }
    }));

    this.fieldsSchema = TikTokAdsFieldsSchema;
    this.apiVersion = "v1.3"; // TikTok Ads API version

  }

  /**
   * Get dimensions based on the specified data level
   * 
   * @param {string} dataLevel - The reporting data level
   * @return {array} - Array of dimension fields
   */
  getDimensionsForDataLevel(dataLevel) {
    let dimensions = [];
    switch (dataLevel) {
      case "AUCTION_ADVERTISER":
        dimensions = ["stat_time_day"];
        break;
      case "AUCTION_CAMPAIGN":
        dimensions = ["campaign_id", "stat_time_day"];
        break;
      case "AUCTION_ADGROUP":
        dimensions = ["adgroup_id", "stat_time_day"];
        break;
      case "AUCTION_AD":
      default:
        dimensions = ["ad_id", "stat_time_day"];
        break;
    }
    return dimensions;
  }

  /**
   * Filter and validate metrics for API request
   * 
   * @param {array} filteredFields - All requested fields
   * @param {array} dimensions - Dimension fields to exclude
   * @param {array} validMetricsList - List of valid metrics
   * @return {array} - Filtered valid metric fields
   */
  getFilteredMetrics(filteredFields, dimensions, validMetricsList) {
    const nonMetricFields = [...dimensions, "advertiser_id", "stat_time_day", "date_start", "date_end"];
    
    return filteredFields
      .filter(field => !nonMetricFields.includes(field))
      .filter(field => validMetricsList.includes(field));
  }

  /**
   * Fetches data from TikTok Ads API
   * 
   * @param {string} nodeName - The node to fetch data from (advertiser, campaigns, ad_groups, ads, ad_insights, audiences)
   * @param {string} advertiserId - The advertiser ID to fetch data for
   * @param {array} fields - Array of field names to fetch
   * @param {Date} startDate - Start date for time-series data (optional)
   * @param {Date} endDate - End date for time-series data (optional)
   * @return {array} - Array of data objects
   */
  fetchData(nodeName, advertiserId, fields, startDate = null, endDate = null) {
    // Check if the node schema exists
    if (!this.fieldsSchema[nodeName]) {
      throw new Error(`Unknown node type: ${nodeName}`);
    }
    
    // Validate that required unique fields are included
    if (this.fieldsSchema[nodeName].uniqueKeys) {
      const uniqueKeys = this.fieldsSchema[nodeName].uniqueKeys;
      const missingKeys = uniqueKeys.filter(key => !fields.includes(key));
      
      if (missingKeys.length > 0) {
        throw new Error(`Missing required unique fields for endpoint '${nodeName}'. Missing fields: ${missingKeys.join(', ')}`);
      }
    }
    
    // Initialize the API provider
    const provider = new TiktokMarketingApiProvider(
      this.config.AppId.value,
      this.config.AccessToken.value,
      this.config.AppSecret.value,
      this.config.SandboxMode && this.config.SandboxMode.value === true
    );
    
    // Store the current advertiser ID so it can be used if missing in records
    this.currentAdvertiserId = advertiserId;
    
    let formattedStartDate = null;
    let formattedEndDate = null;
    
    if (startDate) {
      formattedStartDate = Utilities.formatDate(startDate, "UTC", "yyyy-MM-dd");
      // If no end date is provided, use start date as end date (single day)
      formattedEndDate = endDate 
        ? Utilities.formatDate(endDate, "UTC", "yyyy-MM-dd") 
        : formattedStartDate;
    }

    // Filter parameter for including deleted entities
    let filtering = null;
    if (this.config.IncludeDeleted && this.config.IncludeDeleted.value === true) {
      if (nodeName === 'campaigns') {
        filtering = {"secondary_status": "CAMPAIGN_STATUS_ALL"};
      } else if (nodeName === 'ad_groups') {
        filtering = {"secondary_status": "ADGROUP_STATUS_ALL"};
      } else if (nodeName === 'ads') {
        filtering = {"secondary_status": "AD_STATUS_ALL"};
      }
    }
    
    // Use schema-defined fields
    let filteredFields = fields;
    
    // If no fields specified or empty array, use all fields from schema
    if (!fields || fields.length === 0) {
      if (this.fieldsSchema[nodeName] && this.fieldsSchema[nodeName].fields) {
        filteredFields = Object.keys(this.fieldsSchema[nodeName].fields);
      }
    }

    let allData = [];

    try {
      switch (nodeName) {
        case 'advertiser':
          allData = provider.getAdvertisers(advertiserId);
          break;

        case 'campaigns':
          allData = provider.getCampaigns(advertiserId, filteredFields, filtering);
          break;

        case 'ad_groups':
          allData = provider.getAdGroups(advertiserId, filteredFields, filtering);
          break;

        case 'ads':
          allData = provider.getAds(advertiserId, filteredFields, filtering);
          break;

        case 'ad_insights':
          // Format for ad reporting endpoint
          let dataLevel = this.config.DataLevel && this.config.DataLevel.value ? 
                        this.config.DataLevel.value : "AUCTION_AD";
          
          // Validate the data level
          const validDataLevels = ["AUCTION_ADVERTISER", "AUCTION_CAMPAIGN", "AUCTION_ADGROUP", "AUCTION_AD"];
          if (!validDataLevels.includes(dataLevel)) {
            this.config.logMessage(`⚠️ Invalid data_level: ${dataLevel}. Using default AUCTION_AD.`);
            dataLevel = "AUCTION_AD";
          }
          
          // Set dimensions based on data level
          let dimensions = this.getDimensionsForDataLevel(dataLevel);
      
          // Use only metrics that are in our known valid list
          const validMetricsList = provider.getValidAdInsightsMetrics();
          let metricFields = this.getFilteredMetrics(filteredFields, dimensions, validMetricsList);

          allData = provider.getAdInsights({
            advertiserId: advertiserId,
            dataLevel: dataLevel,
            dimensions: dimensions,
            metrics: metricFields,
            startDate: formattedStartDate,
            endDate: formattedEndDate
          });
          break;
          
        case 'audiences':
          allData = provider.getAudiences(advertiserId);
          break;

        default:
          throw new Error(`Endpoint for ${nodeName} is not implemented yet. Feel free to add idea here: https://github.com/OWOX/js-data-connectors/discussions/categories/ideas`);
      }

      // Cast fields to the correct data types using the provider's castFields method
      allData = allData.map(record => this.castFields(nodeName, record, this.fieldsSchema));


      // add missing fields to the record
      for (let field in this.fieldsSchema[nodeName].fields) {
        if (!(field in allData)) {
          allData[field] = null;
        }
      }

      return allData;

    } catch (error) {
      if (error.message.includes('one or more value of the param is not acceptable, correct is')) {
        // Extract the valid fields from the error message
        try {
          const fieldErrorMatch = error.message.match(/correct is \[(.*?)\]/);
          if (fieldErrorMatch && fieldErrorMatch[1]) {
            const validFieldsFromError = fieldErrorMatch[1].split("', '").map(f => f.replace(/'/g, "").trim());
            
            console.log("API returned valid fields list: " + validFieldsFromError.join(", "));
            
            // Retry with valid fields from the API
            if (validFieldsFromError.length > 0) {
              console.log("Retrying with valid fields from API");
              return this.fetchData(nodeName, advertiserId, validFieldsFromError, startDate, endDate);
            }
          }
        } catch (parseError) {
          console.error("Error parsing valid fields from error message: " + parseError);
        }
      }
      
      console.error(`Error fetching data from TikTok Ads API: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cast record fields to the types defined in schema
   * 
   * @param {string} nodeName - Name of the TikTok API node
   * @param {object} record - Object with all the row fields
   * @return {object} - Record with properly cast field values
   */
  castFields(nodeName, record, schema) {
    // Maximum string length to prevent exceeding column limits
    const MAX_STRING_LENGTH = 50000;
    
    // Special handling for metrics field in ad_insights
    if (nodeName === 'ad_insights') {
      if (record.metrics) {
        // Flatten metrics object into the main record
        for (const metricKey in record.metrics) {
          record[metricKey] = record.metrics[metricKey];
        }
        delete record.metrics;
      }

      if (record.dimensions) {
        // Flatten dimensions object into the main record
        for (const dimensionKey in record.dimensions) {
          record[dimensionKey] = record.dimensions[dimensionKey];
        }
        delete record.dimensions;
      }
      
      // Ensure advertiser_id is present
      if (!record.advertiser_id && this.currentAdvertiserId) {
        record.advertiser_id = this.currentAdvertiserId;
      }
      
      // Handle date fields
      if (record.stat_time_day && !record.date_start) {
        record.date_start = record.stat_time_day;
      }
      if (record.date_start && !record.stat_time_day) {
        record.stat_time_day = record.date_start;
      }
    }

    if (nodeName === 'audiences' && !record.advertiser_id && this.currentAdvertiserId) {
      record.advertiser_id = this.currentAdvertiserId;
    }

    // Verify we have a schema for this node
    if (!schema[nodeName] || !schema[nodeName].fields) {
      console.warn(`No schema defined for node ${nodeName}`);
      return record;
    }

    // Filter out any extremely large fields or fields not in schema
    const processedRecord = {};
    
    // First ensure uniqueKey fields are always included
    if (schema[nodeName].uniqueKeys) {
      for (const keyField of schema[nodeName].uniqueKeys) {
        if (keyField in record) {
          processedRecord[keyField] = record[keyField];
        } 
        else if (keyField === 'advertiser_id' && nodeName === 'ad_insights') {
          processedRecord['advertiser_id'] = this.currentAdvertiserId || '';
        }
      }
    }
    
    // Next add all other fields defined in the schema
    for (let field in schema[nodeName].fields) {
      if (field in record && !processedRecord[field]) {
        processedRecord[field] = record[field];
      }
    }
    
    // Then add other fields from the record that might be needed
    for (let field in record) {
      if (field === 'rowIndex' && !processedRecord[field]) {
        processedRecord[field] = record[field];
      }
    }

    // Now process field types
    for (let field in processedRecord) {
      if (field in schema[nodeName].fields && 
          "type" in schema[nodeName].fields[field]) {
        
        let type = schema[nodeName].fields[field].type;
        let value = processedRecord[field];
        
        if (value === null || value === undefined) {
          continue;
        }
        
        try {
          switch (type) {
            case 'string':
              processedRecord[field] = String(value).substring(0, MAX_STRING_LENGTH);
              break;
              
            case 'int32':
            case 'int64':
            case 'integer':
            case 'numeric string':
              processedRecord[field] = parseInt(value);
              break;
              
            case 'float':
              processedRecord[field] = parseFloat(value);
              break;
              
            case 'bool':
              processedRecord[field] = Boolean(value);
              break;
              
            case 'datetime':
              if (field === 'create_time' || field === 'modify_time') {
                if (typeof value === 'number') {
                  processedRecord[field] = new Date(parseInt(value) * 1000);
                } else if (typeof value === 'string') {
                  processedRecord[field] = new Date(value);
                }
              } else {
                processedRecord[field] = new Date(value);
              }
              break;
 
            case 'object':
            case 'array':
              try {
                const jsonStr = JSON.stringify(value);
                processedRecord[field] = jsonStr.substring(0, MAX_STRING_LENGTH);
              } catch (error) {
                processedRecord[field] = String(value).substring(0, MAX_STRING_LENGTH);
              }
              break;
              
            default:
              console.warn(`Unknown type ${type} for field ${field}`);
              processedRecord[field] = String(value).substring(0, MAX_STRING_LENGTH);
              break;
          }
        } catch (error) {
          console.error(`Error processing field ${field} with value ${value}: ${error.message}`);
          processedRecord[field] = "[Error processing value]";
        }
      } else if (field !== 'rowIndex') {
        console.debug(`Field ${field} in ${nodeName} is not defined in schema`);
        if (processedRecord[field] !== null && processedRecord[field] !== undefined) {
          try {
            processedRecord[field] = String(processedRecord[field]).substring(0, MAX_STRING_LENGTH);
          } catch (error) {
            processedRecord[field] = "[Error processing value]";
          }
        }
      }
    }
    
    return processedRecord;
  }

  /**
   * Returns credential fields for this connector
   */
  getCredentialFields() {
    return {
      AccessToken: this.config.AccessToken,
      AppId: this.config.AppId,
      AppSecret: this.config.AppSecret
    };
  }
};
