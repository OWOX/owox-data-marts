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
        ApiBaseUrl: {
          requiredType: "string",
          default: "https://graph.facebook.com/v21.0/",
          description: "Facebook Graph API base URL"
        },
        AccessToken:{
          isRequired: true,
          requiredType: "string",
        },
        AccoundIDs: {
          isRequired: true,
        },
        Fields: {
          isRequired: true
        },
        ProcessShortLinks: {
          requiredType: "string",
          default: "true",
          description: "Enable automatic processing of short links in link_url_asset field"
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
      console.log(`error.payload =`, error.payload);
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
  
      let url = this.config.ApiBaseUrl.value;
  
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
          url += `act_${accountId}/ads?time_range=${timeRange}&limit=${this.fieldsSchema[nodeName].limit}`;
          break;
  
        case 'ad-account/adcreatives':
          url += `act_${accountId}/adcreatives?fields=${fields.join(",")}&limit=${this.fieldsSchema[nodeName].limit}`;
          break;
  
        case 'ad-account/insights':
          return this._fetchInsightsData(nodeName, accountId, fields, timeRange);
  
        case 'ad-group':
          url += `act_${accountId}/ads?&time_range=${timeRange}&fields=${fields.join(",")}&limit=${this.fieldsSchema[nodeName].limit}`;
          break;
  
        default:
          throw new Error(`End point for ${nodeName} is not implemented yet. Feel free add idea here: https://github.com/OWOX/owox-data-marts/discussions/categories/ideas`);
      }
  
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
    
  //---- _getNestedValue ---------------------------------------------------
    /**
     * Gets nested value from object by dot notation
     * 
     * @param {Object} obj - Object to search in
     * @param {string} path - Dot notation path
     * @return {*} Value or undefined
     * @private
     */
    _getNestedValue(obj, path) {
      return path.split('.').reduce((current, key) => current?.[key], obj);
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
    _fetchInsightsData(nodeName, accountId, fields, timeRange) {
      const { regularFields, breakdownFields } = this._separateFieldsAndBreakdowns(nodeName, fields);
      
      if (breakdownFields.length === 0) {
        // No breakdown fields - single request
        const requestUrl = this._buildInsightsUrl(accountId, regularFields, null, timeRange, nodeName);
        return this._fetchPaginatedData(requestUrl, nodeName);
      }
      
      // Fetch data for each breakdown field
      const results = breakdownFields.map(breakdown => {
        const requestUrl = this._buildInsightsUrl(accountId, regularFields, breakdown, timeRange, nodeName);
        const data = this._fetchPaginatedData(requestUrl, nodeName, `breakdown: ${breakdown}`);
        return { breakdown, data };
      });
      
      const allData = results.length === 1 ? results[0].data : this._mergeRequestResults(results);
      
      // Process short links if link_url_asset data is present
      if (this.config.ProcessShortLinks.value === "true" && allData.length > 0 && allData.some(record => record.link_url_asset)) {
        return this.processShortLinks(allData, { shortLinkFields: ['link_url_asset'] });
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
        this.fieldsSchema[nodeName].fields[field].parameter !== 'breakdown'
      );
      
      const breakdownFields = fields.filter(field => 
        this.fieldsSchema[nodeName].fields[field] && 
        this.fieldsSchema[nodeName].fields[field].parameter === 'breakdown'
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
    _buildInsightsUrl(accountId, regularFields, breakdown, timeRange, nodeName) {
      let url = `${this.config.ApiBaseUrl.value}act_${accountId}/insights?level=ad&period=day&time_range=${timeRange}&fields=${regularFields.join(",")}&limit=${this.fieldsSchema[nodeName].limit}`;
      
      if (breakdown) {
        url += `&breakdowns=${breakdown}`;
      }
      
      url += `&access_token=${this.config.AccessToken.value}`;
      return url;
    }

  //---- _mergeRequestResults ----------------------------------------------
    /**
     * Merge results from multiple requests (only called when multiple requests exist)
     * Creates separate records for each breakdown combination to preserve all data
     * 
     * @param {Array} results - Array of {breakdown, data} objects
     * @return {Array} Merged data with all breakdown combinations
     * @private
     */
    _mergeRequestResults(results) {
      const baseData = results[0].data;
      let mergedData = [...baseData]; // Start with base data
      
      for (let i = 1; i < results.length; i++) {
        const additionalData = results[i].data;
        const additionalBreakdown = results[i].breakdown;
        
        const newMergedData = [];
        
        for (const baseRecord of mergedData) {
          const matchingRecords = additionalData.filter(additionalRecord => 
            baseRecord.campaign_id === additionalRecord.campaign_id &&
            baseRecord.adset_id === additionalRecord.adset_id &&
            baseRecord.ad_id === additionalRecord.ad_id
          );
          
          if (matchingRecords.length > 0) {
            // Create separate record for each matching breakdown value
            for (const matchingRecord of matchingRecords) {
              const value = matchingRecord[additionalBreakdown];
              if (value !== null && value !== "undefined" && value !== undefined) {
                newMergedData.push({
                  ...baseRecord,
                  [additionalBreakdown]: value
                });
              }
            }
          } else {
            // No matches - keep original record without breakdown field
            newMergedData.push(baseRecord);
          }
        }
        
        mergedData = newMergedData;
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
      const allData = [];
      let nextPageURL = initialUrl;
      
      while (nextPageURL) {
        console.log(nextPageURL);
        
        var response = this.urlFetchWithRetry(nextPageURL);
        var jsonData = JSON.parse(response.getContentText());
        
        if ("data" in jsonData) {
          nextPageURL = jsonData.paging ? jsonData.paging.next : null;
          
          // Cast record fields
          jsonData.data.forEach((record, index) => {
            jsonData.data[index] = this.castRecordFields(nodeName, record);
          });
          
          allData.push(...jsonData.data);
        } else {
          nextPageURL = null;
          for (var key in jsonData) {
            jsonData[key] = this.castRecordFields(nodeName, jsonData[key]);
          }
          allData.push(...jsonData);
        }
        
        console.log(`Got ${allData.length} records${logContext ? ' for ' + logContext : ''}`);
      }
      
      return allData;
    }
    
  //---- processShortLinks -------------------------------------------------
    /**
     * Processes short links in Facebook data by resolving them to full URLs
     * Resolves short URLs to full URLs and parses GET parameters
     * 
     * @param {Array} data - Array of insights data records
     * @param {Object} config - Configuration object with settings
     * @return {Array} Data with processed links
     */
    processShortLinks(data, config = {}) {
      const { shortLinkFields = ['link_url_asset'] } = config;

      if (!data.length) {
        return data;
      }

      // Collect unique short links
      const shortLinks = this._collectUniqueShortLinks(data, shortLinkFields);
      
      if (shortLinks.length === 0) {
        return data;
      }

      // Resolve short links to full URLs (returns new objects)
      const resolvedShortLinks = this._resolveShortLinks(shortLinks);

      // Add resolved URLs back to data (returns new data)
      const dataWithResolvedUrls = this._addResolvedUrlsToData(data, resolvedShortLinks, shortLinkFields);

      // Parse GET parameters from resolved URLs (returns new data)
      const finalData = this._parseGetParametersFromUrls(dataWithResolvedUrls, shortLinkFields);

      return finalData;
    }

  //---- _collectUniqueShortLinks -------------------------------------------
    /**
     * Collects unique short links from insights data
     * 
     * @param {Array} data - Insights data
     * @param {Array} shortLinkFields - Fields that contain URLs
     * @return {Array} Array of unique short link objects
     * @private
     */
    _collectUniqueShortLinks(data, shortLinkFields) {
      const uniqueLinks = new Map();

      data.forEach(record => {
        shortLinkFields.forEach(fieldName => {
          const urlAsset = this._getNestedValue(record, fieldName);
          
          if (urlAsset && urlAsset.website_url) {
            const url = urlAsset.website_url;
            
            // Check if it's a potential short link (no query parameters, simple structure)
            if (this._isPotentialShortLink(url) && !uniqueLinks.has(url)) {
              uniqueLinks.set(url, {
                originalUrl: url,
                resolvedUrl: null,
                parsedParams: null
              });
            }
          }
        });
      });

      return Array.from(uniqueLinks.values());
    }

  //---- _isPotentialShortLink ---------------------------------------------- 
    /**
     * Determines if URL is a potential short link
     * 
     * @param {string} url - URL to check
     * @return {boolean} True if potentially a short link
     * @private
     */
    _isPotentialShortLink(url) {
      if (!url || typeof url !== 'string') return false;

      // Skip URLs with query parameters or UTM parameters
      if (url.includes('?') || 
          url.includes('utm_source') || 
          url.includes('utm_medium') || 
          url.includes('utm_campaign') ||
          url.includes('utm_term') || 
          url.includes('utm_content')) {
        return false;
      }

      // Check for simple structure: https://hostname.com/path
      const urlParts = url.split('/');
      return urlParts[0] === 'https:' && 
             urlParts[1] === '' && 
             urlParts[2] && 
             urlParts.length === 4 && 
             urlParts[3] && urlParts[3] !== '';
    }

  //---- _resolveShortLinks -------------------------------------------------
    /**
     * Resolves short links to their full URLs
     * 
     * @param {Array} shortLinks - Array of short link objects
     * @return {Array} New array with resolved URLs
     * @private
     */  
    _resolveShortLinks(shortLinks) {
      return shortLinks.map(linkObj => {
        try {
          const response = EnvironmentAdapter.fetch(linkObj.originalUrl, {
            method: 'GET',
            followRedirects: false,
            muteHttpExceptions: true
          });
          
          const headers = response.getHeaders();
          
          // Try different header names for Location (Node.js uses lowercase)
          const resolvedUrl = headers.Location || headers.location || headers['Location'] || headers['location'] || linkObj.originalUrl;
          
          // Create new object instead of mutating
          return {
            originalUrl: linkObj.originalUrl,
            resolvedUrl: resolvedUrl,
            parsedParams: null
          };
          
        } catch (error) {
          console.log(`Failed to resolve short link ${linkObj.originalUrl}: ${error.message}`);
          
          // Create new object with original URL as resolved
          return {
            originalUrl: linkObj.originalUrl,
            resolvedUrl: linkObj.originalUrl,
            parsedParams: null
          };
        }
      });
    }

  //---- _addResolvedUrlsToData ---------------------------------------------
    /**
     * Adds resolved URLs back to the original data
     * 
     * @param {Array} data - Original insights data
     * @param {Array} resolvedShortLinks - Resolved short links
     * @param {Array} shortLinkFields - Fields containing URLs
     * @return {Array} New data with resolved URLs
     * @private
     */
    _addResolvedUrlsToData(data, resolvedShortLinks, shortLinkFields) {
      const linkMap = new Map(
        resolvedShortLinks.map(link => [link.originalUrl, link.resolvedUrl])
      );

      return data.map(record => {
        const newRecord = { ...record };
        
        shortLinkFields.forEach(fieldName => {
          const urlAsset = this._getNestedValue(newRecord, fieldName);
          
          if (urlAsset && urlAsset.website_url) {
            const resolvedUrl = linkMap.get(urlAsset.website_url);
            
            // Use resolved URL if found, otherwise fallback to original
            const parsedUrl = resolvedUrl || urlAsset.website_url;
            
            const newUrlAsset = {
              ...urlAsset,
              parsed_url: parsedUrl
            };
            
            this._setNestedValue(newRecord, fieldName, newUrlAsset);
          }
        });
        
        return newRecord;
      });
    }

  //---- _parseGetParametersFromUrls ---------------------------------------
    /**
     * Parses GET parameters from resolved URLs
     * 
     * @param {Array} data - Data with resolved URLs
     * @param {Array} shortLinkFields - Fields containing URLs
     * @return {Array} New data with parsed GET parameters
     * @private
     */
    _parseGetParametersFromUrls(data, shortLinkFields) {
      return data.map(record => {
        const newRecord = { ...record };
        
        shortLinkFields.forEach(fieldName => {
          const urlAsset = this._getNestedValue(newRecord, fieldName);
          
          if (urlAsset && urlAsset.parsed_url) {
            const params = this._extractGetParameters(urlAsset.parsed_url);
            if (params && Object.keys(params).length > 0) {
              // Create new nested object with GET parameters
              const newUrlAsset = {
                ...urlAsset,
                get_params: params
              };
              
              this._setNestedValue(newRecord, fieldName, newUrlAsset);
            }
          }
        });
        
        return newRecord;
      });
    }

  //---- _extractGetParameters ---------------------------------------------
    /**
     * Extracts GET parameters from URL
     * 
     * @param {string} url - URL to parse
     * @return {Object|null} Parsed parameters or null
     * @private
     */
    _extractGetParameters(url) {
      if (!url || !url.includes('?')) return null;

      const [, queryString] = url.split('?');
      const getParams = [];
      
      const paramPairs = queryString.includes('&') ? 
        queryString.split('&') : [queryString];
      
      paramPairs.forEach(pair => {
        if (pair.includes('=')) {
          const [key, value] = pair.split('=');
          if (key && value) {
            getParams.push([key, decodeURIComponent(value)]);
          }
        }
      });

      if (getParams.length > 0) {
        return Object.fromEntries(getParams);
      }

      return null;
    }

  //---- _setNestedValue ---------------------------------------------------
    /**
     * Sets nested value in object by dot notation
     * 
     * @param {Object} obj - Object to update
     * @param {string} path - Dot notation path
     * @param {*} value - Value to set
     * @private
     */
    _setNestedValue(obj, path, value) {
      const keys = path.split('.');
      let current = obj;

      keys.forEach((key, index) => {
        if (index === keys.length - 1) {
          current[key] = value;
        } else {
          current = current[key] || {};
        }
      });
    }
    
  }