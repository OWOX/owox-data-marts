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
          description: "Facebook API Access Token for authentication"
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
          requiredType: "string",
          default: "true",
          label: "Process Short Links",
          description: "Enable automatic processing of short links in link_url_asset field"
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
        },
        MaxFetchingDays: {
          requiredType: "number",
          isRequired: true,
          default: 31,
          label: "Max Fetching Days",
          description: "Maximum number of days to fetch data for"
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
          return this._fetchInsightsData(nodeName, accountId, fields, timeRange, url);
  
        case 'ad-group':
          url += `act_${accountId}/ads?fields=${fields.join(",")}&limit=${this.fieldsSchema[nodeName].limit}`;
          break;
  
        default:
          throw new Error(`End point for ${nodeName} is not implemented yet. Feel free add idea here: https://github.com/OWOX/owox-data-marts/discussions/categories/ideas`);
            }
      
      console.log(`Facebook API URL:`, url);

      url += `&access_token=${this.config.AccessToken.value}`;
  
      return this._fetchPaginatedData(url, nodeName);
  
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
     * @param {string} nodeName - Node name
     * @param {string} accountId - Account ID
     * @param {Array} fields - Fields to fetch
     * @param {string} timeRange - Time range parameter
     * @return {Array} Processed insights data
     * @private
     */
    _fetchInsightsData(nodeName, accountId, fields, timeRange, url) {
      const { regularFields, breakdownFields } = this._separateFieldsAndBreakdowns(nodeName, fields);
      
      if (breakdownFields.length === 0) {
        // No breakdown fields - single request
        const requestUrl = this._buildInsightsUrl(accountId, regularFields, null, timeRange, nodeName, url);
        return this._fetchPaginatedData(requestUrl, nodeName);
      }
      
      // Fetch data for each breakdown field
      const results = breakdownFields.map(breakdown => {
        const requestUrl = this._buildInsightsUrl(accountId, regularFields, breakdown, timeRange, nodeName, url);
        const data = this._fetchPaginatedData(requestUrl, nodeName, `breakdown: ${breakdown}`);
        return { breakdown, data };
      });
      
      const allData = results.length === 1 ? results[0].data : this._mergeInsightsResults(results);
      
      // Process short links if link_url_asset data is present
      if (this.config.ProcessShortLinks.value === "true" && allData.length > 0 && allData.some(record => record.link_url_asset)) {
        return processShortLinks(allData, { 
          shortLinkField: 'link_url_asset',
          urlFieldName: 'website_url'
        });
      }
      
      return allData;
    }

  //---- _separateFieldsAndBreakdowns --------------------------------------
    /**
     * Separate regular fields from breakdown fields
     * 
     * @param {string} nodeName - Node name
     * @param {Array} fields - All fields
     * @return {Object} Object with regularFields and breakdownFields
     * @private
     */
    _separateFieldsAndBreakdowns(nodeName, fields) {
      const regularFields = fields.filter(field => 
        !this.fieldsSchema[nodeName].fields[field] || 
        this.fieldsSchema[nodeName].fields[field].fieldType !== 'breakdown'
      );
      
      const breakdownFields = fields.filter(field => 
        this.fieldsSchema[nodeName].fields[field] && 
        this.fieldsSchema[nodeName].fields[field].fieldType === 'breakdown'
      );
      
      return { regularFields, breakdownFields };
    }

  //---- _buildInsightsUrl ------------------------------------------------
    /**
     * Build insights URL for request
     * 
     * @param {string} accountId - Account ID
     * @param {Array} regularFields - Regular fields
     * @param {string} breakdown - Breakdown field (can be null)
     * @param {string} timeRange - Time range
     * @param {string} nodeName - Node name
     * @return {string} Complete URL
     * @private
     */
    _buildInsightsUrl(accountId, regularFields, breakdown, timeRange, nodeName, url) {
      let insightsUrl = `${url}act_${accountId}/insights?level=ad&period=day&time_range=${timeRange}&fields=${regularFields.join(",")}&limit=${this.fieldsSchema[nodeName].limit}`;
      
      if (breakdown) {
        insightsUrl += `&breakdowns=${breakdown}`;
      }
      
      console.log(`Facebook API URL:`, insightsUrl);
      
      insightsUrl += `&access_token=${this.config.AccessToken.value}`;
      return insightsUrl;
    }

  //---- _mergeInsightsResults ----------------------------------------------
    /**
     * Merge insights results from multiple breakdown requests
     * Simple approach: start with first data, then add/update from additional data
     * 
     * @param {Array} results - Array of {breakdown, data} objects
     * @return {Array} Merged insights data with all records preserved
     * @private
     */
    _mergeInsightsResults(results) {
      if (results.length === 0) return [];
      if (results.length === 1) return results[0].data;
      
      let mergedData = results[0].data.slice();
      
      for (let i = 1; i < results.length; i++) {
        const additionalData = results[i].data;
        const additionalBreakdown = results[i].breakdown;
        
        for (const additionalRecord of additionalData) {
          const value = additionalRecord[additionalBreakdown];
          if (value === null || value === "undefined" || value === undefined) continue;
          
          const existingRecord = mergedData.find(record =>  record.ad_id === additionalRecord.ad_id);
          
          if (existingRecord) {
            existingRecord[additionalBreakdown] = value;
          } else {
            const newRecord = {};
            for (const key in additionalRecord) {
              newRecord[key] = additionalRecord[key];
            }
            mergedData.push(newRecord);
          }
        }
      }
      
      return mergedData;
    }

  //---- _fetchPaginatedData -----------------------------------------------
    /**
     * Fetch paginated data from Facebook API
     * 
     * @param {string} initialUrl - Initial URL to fetch
     * @param {string} nodeName - Node name for field casting
     * @param {string} logContext - Context for logging
     * @return {Array} All fetched data
     * @private
     */
    _fetchPaginatedData(initialUrl, nodeName, logContext = '') {
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

          // date fields must be converted to Date objects to meet unique key requirements 
          jsonData.data.forEach(record => {
            record = this.castRecordFields(nodeName, record);
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
