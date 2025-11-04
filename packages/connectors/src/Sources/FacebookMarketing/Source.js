/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/* eslint-disable no-unused-vars, no-undef */
var FacebookMarketingSource = class FacebookMarketingSource extends AbstractSource {

  //---- constructor -------------------------------------------------
    constructor(config) {
  
      super(config.mergeParameters({
        AccessToken:{
          isRequired: true,
          requiredType: "string",
          label: "Access Token",
          description: "Facebook API Access Token for authentication",
          attributes: [CONFIG_ATTRIBUTES.SECRET]
        },
        AccoundIDs: {
          isRequired: true,
          label: "Account IDs",
          description: "Facebook Ad Account IDs to fetch data from"
        },
        StartDate: {
          requiredType: "date",
          label: "Start Date",
          description: "Start date for data import",
          attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL]
        },
        EndDate: {
          requiredType: "date",
          label: "End Date",
          description: "End date for data import",
          attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
        },
        Fields: {
          isRequired: true,
          label: "Fields",
          description: "List of fields to fetch from Facebook API"
        },
        ProcessShortLinks: {
          requiredType: "boolean",
          default: true,
          label: "Process Short Links",
          description: "Enable automatic processing of short links in link_url_asset field. Only available for ad-account/insights-by-link-url-asset endpoint as it requires breakdown by link_url_asset"
        },
        CreateEmptyTables: {
          requiredType: "boolean",
          default: true,
          label: "Create Empty Tables",
          description: "Create tables with all columns even if no data is returned from API (true/false)"
        },
        ReimportLookbackWindow: {
          requiredType: "number",
          isRequired: true,
          default: 2,
          label: "Reimport Lookback Window",
          description: "Number of days to look back when reimporting data"
        },
        CleanUpToKeepWindow: {
          requiredType: "number",
          label: "Clean Up To Keep Window",
          description: "Number of days to keep data before cleaning up"
        }
      }));
      
      this.fieldsSchema = FacebookMarketingFieldsSchema;
  
    }
    
  //---- isValidToRetry ----------------------------------------------
    /**
     * Determines if a Facebook API error is valid for retry
     * Based on Facebook error codes
     * 
     * @param {HttpRequestException} error - The error to check
     * @return {boolean} True if the error should trigger a retry, false otherwise
     */
    isValidToRetry(error) {
      console.log(`isValidToRetry() called`);
      console.log(`error.statusCode =`, error.statusCode);

      if (error.statusCode && error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN) {
        return true;
      }

      if (!error.payload || !error.payload.error) {
        return false;
      }

      const fbErr = error.payload.error;
      const code = Number(fbErr.code);
      const subcode = Number(fbErr.error_subcode);

      console.log(`FB error.code = ${code}`);
      console.log(`FB error.error_subcode = ${subcode}`);
      console.log(`is_transient = ${fbErr.is_transient}`);
      console.log(`code in retry list = ${FB_RETRYABLE_ERROR_CODES.includes(code)}`);
      console.log(`subcode in retry list = ${FB_RETRYABLE_ERROR_CODES.includes(subcode)}`);

      return fbErr.is_transient === true
             || FB_RETRYABLE_ERROR_CODES.includes(code)
             || FB_RETRYABLE_ERROR_CODES.includes(subcode);
    }
  
  //---- fetchData -------------------------------------------------
    /*
    @param nodeName string
    @param accountId string
    @param fields array
    @param startDate date
  
    @return data array
  
    */
    fetchData(nodeName, accountId, fields, startDate = null)  {
  
      //console.log(`Fetching data from ${nodeName}/${accountId}/${fields} for ${startDate}`);
  
      let url = 'https://graph.facebook.com/v23.0/';
  
      let formattedDate = null;
      let timeRange = null;
  
      if( startDate ) {
        formattedDate = EnvironmentAdapter.formatDate(startDate, "UTC", "yyyy-MM-dd");
        timeRange = encodeURIComponent(JSON.stringify({since:formattedDate, until:formattedDate}));
      }
  
      switch (nodeName) {
        case 'ad-account':
          url += `act_${accountId}?fields=${fields.join(",")}`;
          break;
  
        case 'ad-account-user':
          url += `act_${accountId}/?fields=${fields.join(",")}`;
          break;
  
        case 'ad-account/ads':
          url += `act_${accountId}/ads?limit=${this.fieldsSchema[nodeName].limit}`;
          break;
  
        case 'ad-account/adcreatives':
          url += `act_${accountId}/adcreatives?fields=${fields.join(",")}&limit=${this.fieldsSchema[nodeName].limit}`;
          break;
  
        case 'ad-account/insights':
        case 'ad-account/insights-by-country':
        case 'ad-account/insights-by-link-url-asset':
          return this._fetchInsightsData({ nodeName, accountId, fields, timeRange, url });

        case 'ad-group':
          url += `act_${accountId}/ads?fields=${this._buildFieldsString({ nodeName, fields })}&limit=${this.fieldsSchema[nodeName].limit}`;
          break;
  
        default:
          throw new Error(`End point for ${nodeName} is not implemented yet. Feel free add idea here: https://github.com/OWOX/owox-data-marts/discussions/categories/ideas`);
            }
      
      console.log(`Facebook API URL:`, url);

      url += `&access_token=${this.config.AccessToken.value}`;
  
      return this._fetchPaginatedData(url, nodeName, fields);
  
    }
  
  
  //---- castRecordFields -------------------------------------------------
    /**
     * Cast of record fields to the types defined in schema
     * 
     * @param nodeName string name of the facebook api node
     * @param record object with all the row fields
     * 
     * @return record
     * 
     */
    castRecordFields(nodeName, record) {
  
      for (var field in record) { 
        if( field in this.fieldsSchema[ nodeName ]["fields"] 
        && "type" in this.fieldsSchema[ nodeName ]["fields"][field] ) {
  
          let type = this.fieldsSchema[ nodeName ]["fields"][field]["type"];
          
          switch ( true ) {
  
            case type == 'string' && field.slice(0, 5) == "date_":
              record[ field ] = new Date(record[ field ] + "T00:00:00Z");
              break;
  
            case type == 'numeric string' && ( field.slice(-3) == "_id" || field == "id" ):
              record[ field ] = String(record[ field ]);
              break;
            
            case type == 'numeric string' && ( field.slice(-5) == "spend"  ):
              record[ field ] = parseFloat(record[ field ]);
              break;
  
            case type == 'numeric string':
              record[ field ] = parseInt(record[ field ]);
              break;
  
            case type == 'unsigned int32':
              record[ field ] = parseInt(record[ field ]);
              break;
  
            case type == 'float':
              record[ field ] = parseFloat(record[ field ]);
              break;
  
            case type == 'bool':
              record[ field ] = Boolean(record[ field ]);
              break;
  
            case type == 'datetime':
              record[ field ] = new Date(record[ field ]);
              break;
  
            case type == 'int32':
              record[ field ] = parseInt(record[ field ]);
              break;
          }
        }
      }
  
      return record;
    }
    
  //---- _fetchInsightsData ------------------------------------------------
    /**
     * Fetch insights data with breakdown support
     * 
     * @param {Object} params - Parameters object
     * @param {string} params.nodeName - Node name
     * @param {string} params.accountId - Account ID
     * @param {Array} params.fields - Fields to fetch
     * @param {string} params.timeRange - Time range parameter
     * @param {string} params.url - Base URL
     * @return {Array} Processed insights data
     * @private
     */
    _fetchInsightsData({ nodeName, accountId, fields, timeRange, url }) {
      const breakdowns = this.fieldsSchema[nodeName].breakdowns || [];
      const regularFields = this._prepareFields({ nodeName, fields, breakdowns });
      
      const requestUrl = this._buildInsightsUrl({
        accountId,
        fields: regularFields,
        breakdowns,
        timeRange,
        nodeName,
        url
      });
      
      const allData = this._fetchPaginatedData(requestUrl, nodeName, fields);
      
      // Process short links if link_url_asset data is present
      if (this.config.ProcessShortLinks.value && allData.length > 0 && allData.some(record => record.link_url_asset)) {
        return processShortLinks(allData, { 
          shortLinkField: 'link_url_asset',
          urlFieldName: 'website_url'
        });
      }
      
      return allData;
    }

  //---- _prepareFields --------------------------------------
    /**
     * Filter and prepare fields for API request
     * Filters out fields that don't exist in schema and removes breakdown fields
     * Breakdowns are passed separately in &breakdowns= parameter, not in &fields=
     * 
     * @param {Object} params - Parameters object
     * @param {string} params.nodeName - Node name
     * @param {Array} params.fields - All fields
     * @param {Array} params.breakdowns - Breakdown fields to exclude
     * @return {Array} Regular fields ready for API request
     * @private
     */
    _prepareFields({ nodeName, fields, breakdowns }) {
      return fields.filter(field => 
        this.fieldsSchema[nodeName].fields[field] && !breakdowns.includes(field)
      );
    }

  //---- _buildInsightsUrl ------------------------------------------------
    /**
     * Build insights URL for request
     * 
     * @param {Object} params - Parameters object
     * @param {string} params.accountId - Account ID
     * @param {Array} params.fields - Fields to fetch
     * @param {Array} params.breakdowns - Breakdown fields
     * @param {string} params.timeRange - Time range
     * @param {string} params.nodeName - Node name
     * @param {string} params.url - Base URL
     * @return {string} Complete URL
     * @private
     */
    _buildInsightsUrl({ accountId, fields, breakdowns, timeRange, nodeName, url }) {
      let insightsUrl = `${url}act_${accountId}/insights?level=ad&period=day&time_range=${timeRange}&fields=${fields.join(",")}&limit=${this.fieldsSchema[nodeName].limit}`;
      
      if (breakdowns.length > 0) {
        insightsUrl += `&breakdowns=${breakdowns.join(",")}`;
      }
      
      console.log(`Facebook API URL:`, insightsUrl);
      
      insightsUrl += `&access_token=${this.config.AccessToken.value}`;
      return insightsUrl;
    }

  //---- _buildFieldsString ------------------------------------------------
    /**
     * Build fields string for Facebook API request
     * Filters out fields that don't exist in schema
     * Handles nested fields using Facebook's syntax: parent{field1,field2}
     * 
     * @param {Object} params - Parameters object
     * @param {string} params.nodeName - Node name
     * @param {Array} params.fields - Fields to fetch
     * @return {string} Fields string for API request
     * @private
     */
    _buildFieldsString({ nodeName, fields }) {
      const nestedFields = {}; // e.g. { creative: ['id', 'name', 'url_tags'] }
      const regularFields = [];
      const skippedFields = [];
      
      // First, filter fields that exist in schema
      for (const field of fields) {
        const fieldConfig = this.fieldsSchema[nodeName].fields[field];
        
        // Skip fields that don't exist in schema
        if (!fieldConfig) {
          skippedFields.push(field);
          continue;
        }
        
        // Check if field has nested structure (apiName with dot notation)
        if (fieldConfig.apiName && fieldConfig.apiName.includes('.')) {
          const [parent, ...childParts] = fieldConfig.apiName.split('.');
          const child = childParts.join('.');
          
          if (!nestedFields[parent]) {
            nestedFields[parent] = [];
          }
          nestedFields[parent].push(child);
        } else {
          regularFields.push(field);
        }
      }
      
      // Log skipped fields for debugging
      if (skippedFields.length > 0) {
        console.log(`Skipped fields not found in ${nodeName} schema:`, skippedFields.join(', '));
      }
      
      // Build final fields array
      const finalFields = [...regularFields];
      
      // Add nested fields in format: parent{field1,field2}
      for (const [parent, children] of Object.entries(nestedFields)) {
        finalFields.push(`${parent}{${children.join(',')}}`);
      }
      
      return finalFields.join(',');
    }

  //---- _mapResultToColumns -----------------------------------------------
    /**
     * Map API result to requested column names
     * Only includes fields that exist in schema and were requested
     * Handles nested fields using apiName mapping
     * 
     * @param {Object} result - API response result
     * @param {string} nodeName - Node name for schema lookup
     * @param {Array<string>} requestedFields - Fields that were requested
     * @return {Object} Mapped result with only requested columns
     * @private
     */
    _mapResultToColumns(result, nodeName, requestedFields) {
      const mapped = {};
      
      for (const fieldName of requestedFields) {
        const fieldConfig = this.fieldsSchema[nodeName].fields[fieldName];
        
        if (!fieldConfig) {
          continue;
        }
        
        // Check if field has nested structure (apiName)
        if (fieldConfig.apiName) {
          // Get value from nested API response (e.g. creative.id)
          mapped[fieldName] = this._getNestedValue(result, fieldConfig.apiName);
        } else {
          // Regular field - get directly from result
          mapped[fieldName] = result[fieldName];
        }
      }
      
      return mapped;
    }

  //---- _getNestedValue ---------------------------------------------------
    /**
     * Get nested value from object using dot-notation path
     * @param {Object} obj - Object to search in
     * @param {string} path - Dot-notation path (e.g. 'creative.id')
     * @return {*} Value at path or undefined
     * @private
     */
    _getNestedValue(obj, path) {
      return path.split('.').reduce((current, key) => current?.[key], obj);
    }

  //---- _fetchPaginatedData -----------------------------------------------
    /**
     * Fetch paginated data from Facebook API
     * 
     * @param {string} initialUrl - Initial URL to fetch
     * @param {string} nodeName - Node name for field casting
     * @param {Array} fields - Fields that were requested
     * @return {Array} All fetched data
     * @private
     */
    _fetchPaginatedData(initialUrl, nodeName, fields) {
      var allData = [];
      var nextPageURL = initialUrl;

      while (nextPageURL) {
        // Fetch data from the JSON URL
        var response = this.urlFetchWithRetry(nextPageURL);
        var jsonData = JSON.parse(response.getContentText());

        // This node point returns a result in the data property, which might be paginated 
        if("data" in jsonData) {

          nextPageURL = jsonData.paging ? jsonData.paging.next : null;
          //nextPageURL = null;

          jsonData.data.forEach((record, index) => {
            // Map to requested columns only (excludes unwanted nested objects)
            let mappedRecord = this._mapResultToColumns(record, nodeName, fields);
            // Then cast fields to proper types
            mappedRecord = this.castRecordFields(nodeName, mappedRecord);
            jsonData.data[index] = mappedRecord;
          });

          allData = allData.concat(jsonData.data);

        // this is non-paginated result
        } else {
          nextPageURL = null;
          for(var key in jsonData) {
            jsonData[ key ] = this.castRecordFields(nodeName, jsonData[key]);
          }
          allData = allData.concat(jsonData);
        }
        console.log(`Got ${allData.length} records`);

      }
      //console.log(allData);
      return allData;
    }
    
  }
