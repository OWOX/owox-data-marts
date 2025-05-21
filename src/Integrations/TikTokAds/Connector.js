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
        isRequired: true,
        requiredType: "string",
      },
      AppSecret: {
        isRequired: true,
        requiredType: "string",
      },
      AdvertiserIDs: {
        isRequired: true,
        requiredType: "string",
      },
      Objects: {
        isRequired: true,
        type: "string",
        description: "Comma-separated list of objects to fetch from TikTok Ads API (e.g., 'advertisers, campaigns, ad_groups, ads, ad_insights')",
      },
      DataLevel: {
        requiredType: "string", 
        default: "AUCTION_AD",
        description: "Data level for ad_insights reports (AUCTION_ADVERTISER, AUCTION_CAMPAIGN, AUCTION_ADGROUP, AUCTION_AD)"
      },
      StartDate: {
        requiredType: "string",
        description: "Start date for data import in YYYY-MM-DD format"
      },
      EndDate: {
        requiredType: "string",
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
    
    // Initialize app_id and app_secret from the configuration
    this.appId = config.AppId && config.AppId.value ? config.AppId.value : null;
    this.appSecret = config.AppSecret && config.AppSecret.value ? config.AppSecret.value : null;
  }

  /**
   * Returns connector parameters schema
   * @return {object} Schema of the connector parameters in format {"paramName": "param description", ...}
   */
  get parameters() {
    return {
      "AccessToken": {
        isRequired: true,
        type: "string",
        description: "TikTok Ads API access token",
      },
      "AppId": {
        isRequired: true,
        type: "string",
        description: "TikTok Ads API app ID",
      },
      "AppSecret": {
        isRequired: true,
        type: "string",
        description: "TikTok Ads API app secret",
      },
      "AdvertiserIDs": {
        isRequired: true,
        type: "string",
        description: "Comma or semicolon-separated list of advertiser IDs",
      },
      "Objects": {
        isRequired: true,
        type: "string",
        description: "Comma-separated list of objects to fetch from TikTok Ads API (e.g., 'advertisers, campaigns, ad_groups, ads, ad_insights')",
      },
      "DataLevel": {
        isRequired: false,
        type: "string",
        description: "Data level for ad_insights reports (AUCTION_ADVERTISER, AUCTION_CAMPAIGN, AUCTION_ADGROUP, AUCTION_AD). Default is AUCTION_AD.",
      },
      "MaxFetchingDays": {
        isRequired: false,
        type: "string",
        description: "Maximum number of days to fetch. Default value is 31 days.",
      },
      "ReimportLookbackWindow": {
        isRequired: false,
        type: "string",
        description: "How many days back to reimport data for each run. Default value is 7 days.",
      },
      "CleanUpToKeepWindow": {
        isRequired: false,
        type: "string",
        description: "How many days of historical data to keep. Older data will be deleted. Leave empty to keep all data.",
      },
      "IncludeDeleted": {
        isRequired: false,
        type: "string", 
        description: "Whether to include deleted objects (true/false). Default is false.",
      },
      "SandboxMode": {
        isRequired: false,
        type: "string", 
        description: "Whether to use sandbox data (true/false). Default is false.",
      },
      "StartDate": {
        isRequired: false,
        type: "string",
        description: "Start date of data import in YYYY-MM-DD format. If not specified, the lookback window will be used.",
      },
      "EndDate": {
        isRequired: false,
        type: "string",
        description: "End date of data import in YYYY-MM-DD format. If not specified, the current date will be used.",
      }
    };
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
    // Determine base URL based on sandbox mode
    const baseUrl = this.config.SandboxMode && this.config.SandboxMode.value === true
      ? "https://sandbox-ads.tiktok.com/open_api/"
      : "https://business-api.tiktok.com/open_api/";
    
    let url = `${baseUrl}${this.apiVersion}/`;
    
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
        filtering = JSON.stringify({"secondary_status": "CAMPAIGN_STATUS_ALL"});
      } else if (nodeName === 'ad_groups') {
        filtering = JSON.stringify({"secondary_status": "ADGROUP_STATUS_ALL"});
      } else if (nodeName === 'ads') {
        filtering = JSON.stringify({"secondary_status": "AD_STATUS_ALL"});
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

    // Construct the appropriate URL based on the node name
    switch (nodeName) {
      case 'advertiser':
        // For the advertiser endpoint, we need to include app_id and secret as URL parameters
        if (!this.appId || !this.appSecret) {
          throw new Error("To fetch advertiser data, both AppId and AppSecret must be provided in the configuration.");
        }
        
        url += `oauth2/advertiser/get/?advertiser_ids=${advertiserId}`;
        
        // Always include app_id and app_secret for advertiser endpoint
        url += `&app_id=${encodeURIComponent(this.appId)}`;
        url += `&secret=${encodeURIComponent(this.appSecret)}`;
        break;

      case 'campaigns':
        url += `campaign/get/?advertiser_id=${advertiserId}&fields=${encodeURIComponent(JSON.stringify(filteredFields))}`;
        if (filtering) {
          url += `&filtering=${encodeURIComponent(filtering)}`;
        }
        break;

      case 'ad_groups':
        url += `adgroup/get/?advertiser_id=${advertiserId}&fields=${encodeURIComponent(JSON.stringify(filteredFields))}`;
        if (filtering) {
          url += `&filtering=${encodeURIComponent(filtering)}`;
        }
        break;

      case 'ads':
        url += `ad/get/?advertiser_id=${advertiserId}&fields=${encodeURIComponent(JSON.stringify(filteredFields))}`;
        if (filtering) {
          url += `&filtering=${encodeURIComponent(filtering)}`;
        }
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
        // NOTE: TikTok API requires specific dimensions for each data_level
        // The advertiser_id should NOT be included in dimensions as it's part of the request URL
        let dimensions = [];
        switch (dataLevel) {
          case "AUCTION_ADVERTISER":
            // For advertiser level, only need stat_time_day
            dimensions = ["stat_time_day"];
            break;
          case "AUCTION_CAMPAIGN":
            // For campaign level, need campaign_id and stat_time_day
            dimensions = ["campaign_id", "stat_time_day"];
            break;
          case "AUCTION_ADGROUP":
            // For ad group level, need adgroup_id and stat_time_day
            dimensions = ["adgroup_id", "stat_time_day"];
            break;
          case "AUCTION_AD":
          default:
            // For ad level, need ad_id and stat_time_day
            dimensions = ["ad_id", "stat_time_day"];
            break;
        }
    
                
        // Filter out dimension fields from metrics
        // TikTok API requires that metrics and dimensions be mutually exclusive
        const nonMetricFields = [...dimensions, "advertiser_id", "stat_time_day", "date_start", "date_end"];
        
        // Use only metrics that are in our known valid list
        const validMetricsList = this.getValidAdInsightsMetrics();
        let metricFields = filteredFields
          .filter(field => !nonMetricFields.includes(field))
          .filter(field => validMetricsList.includes(field));
  
        
        url += `report/integrated/get/?advertiser_id=${advertiserId}` +
               `&report_type=BASIC&dimensions=${encodeURIComponent(JSON.stringify(dimensions))}` +
               `&metrics=${encodeURIComponent(JSON.stringify(metricFields))}` +
               `&data_level=${dataLevel}` +
               `&start_date=${formattedStartDate}&end_date=${formattedEndDate}`;
        
        break;
        
      case 'audiences':
        url += `dmp/custom_audience/list/?advertiser_id=${advertiserId}`;
        break;

      default:
        throw new Error(`Endpoint for ${nodeName} is not implemented yet. Feel free to add idea here: https://github.com/OWOX/js-data-connectors/discussions/categories/ideas`);
    }

    // Add access token to the request headers
    const headers = {
      'Access-Token': this.config.AccessToken.value
    };

    let allData = [];
    let page = 1;
    let hasMorePages = true;
    const pageSize = 100; // TikTok API standard page size

    // Handle pagination
    while (hasMorePages) {
      let pageUrl = url;
      
      // Add pagination parameters
      if (nodeName !== 'advertiser') {
        pageUrl += `&page=${page}&page_size=${pageSize}`;
      }
      
      try {
        const response = this.urlFetchWithRetry(pageUrl, { headers: headers });

        const responseCode = response.getResponseCode();
        
        if (responseCode !== 200) {
          throw new Error(`TikTok API error: ${response.getContentText()}`);
        }
        
        const jsonData = JSON.parse(response.getContentText());
        
        // Check if the request was successful
        if (jsonData.code !== 0) {
          // Handle rate limiting as a special case
          if (jsonData.code === 40100) {
            const errorMessage = "TikTok Marketing API rate limit exceeded. Please try again later.";
            console.error(errorMessage);
            // Wait longer before retrying
            Utilities.sleep(2000);
            continue; // Try the same request again
          }
          
          // Handle field validation errors - try to extract valid fields from error message
          if (jsonData.message && jsonData.message.includes("one or more value of the param is not acceptable, correct is")) {
            // Extract the valid fields from the error message
            try {
              const fieldErrorMatch = jsonData.message.match(/correct is \[(.*?)\]/);
              if (fieldErrorMatch && fieldErrorMatch[1]) {
                const validFieldsFromError = fieldErrorMatch[1].split("', '").map(f => f.replace(/'/g, "").trim());
                
                console.log("API returned valid fields list: " + validFieldsFromError.join(", "));
                
                // Retry with valid fields from the API
                if (validFieldsFromError.length > 0) {
                  console.log("Retrying with valid fields from API");
                  filteredFields = validFieldsFromError;
                  pageUrl = url.replace(/fields=.*?(?=&|$)/, `fields=${encodeURIComponent(JSON.stringify(validFieldsFromError))}`);
                  continue; // Retry the request with correct fields
                }
              }
            } catch (parseError) {
              console.error("Error parsing valid fields from error message: " + parseError);
            }
          }
                    
          throw new Error(`TikTok API error: ${jsonData.message}`);
        }
        
        // Get the data from the response
        let pageData = [];
        
        if (nodeName === 'ad_insights') {
          // Report data is structured differently
          pageData = jsonData.data.list || [];
        } else {
          pageData = jsonData.data.list || [];
        }
        
        // Cast fields to the correct data types
        pageData.forEach(record => {
          record = this.castRecordFields(nodeName, record);
        });
        
        // Add data to the result array
        allData = allData.concat(pageData);
        
        // Check if there are more pages
        const total = jsonData.data.page_info ? jsonData.data.page_info.total_number : 0;
        const currentCount = page * pageSize;
        
        hasMorePages = (currentCount < total && pageData.length > 0);
        page++;
        
        // Respect TikTok API rate limits
        if (hasMorePages) {
          Utilities.sleep(100); // Small delay between requests
        }
      } catch (error) {
        console.error(`Error fetching data from TikTok Ads API: ${error.message}`);
        throw error;
      }
    }

    return allData;
  }

  /**
   * Cast record fields to the types defined in schema
   * 
   * @param {string} nodeName - Name of the TikTok API node
   * @param {object} record - Object with all the row fields
   * @return {object} - Record with properly cast field values
   */
  castRecordFields(nodeName, record) {
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
      
      // For ad_insights, make sure we have date_start field copied from stat_time_day if it exists
      if (record.stat_time_day && !record.date_start) {
        record.date_start = record.stat_time_day;
      }
      
      // And vice versa, make sure we have stat_time_day for backward compatibility
      if (record.date_start && !record.stat_time_day) {
        record.stat_time_day = record.date_start;
      }
    }

    if (nodeName === 'audiences') {
      if (!record.advertiser_id && this.currentAdvertiserId) {
        record.advertiser_id = this.currentAdvertiserId;
      }
    }
    // Maximum string length to prevent exceeding column limits
    const MAX_STRING_LENGTH = 50000;
    
    // Verify we have a schema for this node
    if (!this.fieldsSchema[nodeName] || !this.fieldsSchema[nodeName].fields) {
      console.warn(`No schema defined for node ${nodeName}`);
      return record;
    }

    // Filter out any extremely large fields or fields not in schema
    const processedRecord = {};
    
    // First ensure uniqueKey fields are always included
    if (this.fieldsSchema[nodeName].uniqueKeys) {
      for (const keyField of this.fieldsSchema[nodeName].uniqueKeys) {
        // If the key field exists in the record, copy it
        if (keyField in record) {
          processedRecord[keyField] = record[keyField];
        } 
        // For ad_insights, ensure advertiser_id is always present
        else if (keyField === 'advertiser_id' && nodeName === 'ad_insights') {
          // Since advertiser_id is in the URL, we know what it is and can add it if missing
          processedRecord['advertiser_id'] = this.currentAdvertiserId || '';
          console.warn(`Adding missing advertiser_id to record for ad_insights`);
        }
      }
    }
    
    // Next add all other fields defined in the schema
    for (let field in this.fieldsSchema[nodeName].fields) {
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
      if (field in this.fieldsSchema[nodeName].fields && 
          "type" in this.fieldsSchema[nodeName].fields[field]) {
        
        let type = this.fieldsSchema[nodeName].fields[field].type;
        let value = processedRecord[field];
        
        // Skip null or undefined values
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
              // Handle special case for insight date fields
              if (field === 'date_start' || field === 'date_end' || field === 'stat_time_day') {
                processedRecord[field] = new Date(value + "T00:00:00Z");
              } else if (field === 'create_time' || field === 'modify_time') {
                // Handle different time formats
                if (typeof value === 'number') {
                  // TikTok API sometimes returns timestamps in seconds
                  processedRecord[field] = new Date(parseInt(value) * 1000);
                } else if (typeof value === 'string') {
                  // Handle ISO format strings
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
              // Convert to string with length limit as a fallback
              processedRecord[field] = String(value).substring(0, MAX_STRING_LENGTH);
              break;
          }
        } catch (error) {
          console.error(`Error processing field ${field} with value ${value}: ${error.message}`);
          // Use a safe default
          processedRecord[field] = "[Error processing value]";
        }
      } else if (field !== 'rowIndex') {
        // Field not in schema, log only if it's not the special rowIndex field
        console.debug(`Field ${field} in ${nodeName} is not defined in schema`);
        // Still include it but convert to string with limit
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
   * Helper method to handle rate limiting with exponential backoff
   * @param {Function} requestFn - Function that makes the actual request
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} initialBackoff - Initial backoff time in milliseconds
   * @return {object} - Response from the API
   */
  handleRateLimiting(requestFn, maxRetries = 3, initialBackoff = 1000) {
    let retries = 0;
    let backoff = initialBackoff;
    
    while (retries < maxRetries) {
      try {
        return requestFn();
      } catch (error) {
        if (error.message.includes('rate limit') && retries < maxRetries - 1) {
          console.log(`Rate limited, retrying in ${backoff}ms...`);
          Utilities.sleep(backoff);
          retries++;
          backoff *= 2; // Exponential backoff
        } else {
          throw error;
        }
      }
    }
  }
  
  /**
   * Returns a list of valid metrics for ad insights
   * 
   * @return {array} List of known valid metrics for the integrated reports endpoint
   */
  getValidAdInsightsMetrics() {
    // These metrics are documented to work with the integrated reports endpoint
    // Source: https://business-api.tiktok.com/portal/docs?id=1751443967255553
    return [
      // Cost metrics
      "spend", "cpc", "cpm", "cpr", "cpa", "cost_per_conversion", "cost_per_1000_reached",
      
      // Performance metrics
      "impressions", "clicks", "ctr", "reach", "frequency", "viewable_impression", 
      "viewable_rate", "video_play_actions", "video_watched_2s", "video_watched_6s",
      "average_video_play", "average_video_play_per_user", "video_views_p25", 
      "video_views_p50", "video_views_p75", "video_views_p100", "profile_visits",
      "profile_visits_rate", "likes", "comments", "shares", "follows", "landing_page_views",
      
      // Conversion metrics
      "conversion", "cost_per_conversion", "conversion_rate", "conversion_1d_click", 
      "conversion_7d_click", "conversion_28d_click"
    ];
  }
}; 