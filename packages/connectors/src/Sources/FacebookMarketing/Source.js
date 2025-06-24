/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var FacebookMarketingSource = class FacebookMarketingSource extends AbstractSource {

  //---- constructor -------------------------------------------------
    constructor(config) {
  
      super(config.mergeParameters({
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
  
      let url = 'https://graph.facebook.com/v21.0/';
  
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
          url += `act_${accountId}/insights?level=ad&period=day&time_range=${timeRange}&fields=${fields.join(",")}&limit=${this.fieldsSchema[nodeName].limit}`;
          break;
          // ad, adset, campaign, account
  
        case 'ad-group':
          url += `act_${accountId}/ads?&time_range=${timeRange}&fields=${fields.join(",")}&limit=${this.fieldsSchema[nodeName].limit}`;
          break;
  
        default:
          throw new Error(`End point for ${nodeName} is not implemented yet. Feel free add idea here: https://github.com/OWOX/owox-data-marts/discussions/categories/ideas`);
      }
  
      url += `&access_token=${this.config.AccessToken.value}`;
  
      var allData = [];
      var nextPageURL = url;
  
      while (nextPageURL) {
        // Fetch data from the JSON URL
        console.log(nextPageURL);
        
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
      
      // Check if short link processing is requested
      if (fields.includes('link_url_asset') && allData.length > 0) {
        // Process short links automatically when link_url_asset field is requested
        allData = this.processShortLinks(allData, {
          processShortLinks: true,
          shortLinkFields: ['link_url_asset'],
          maxConcurrentRequests: 5
        });
      }
      
      return allData;
  
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
    
  //---- processShortLinks -------------------------------------------------
    /**
     * Processes short links from Facebook insights data
     * Resolves short URLs to full URLs and parses GET parameters
     * 
     * @param {Array} data - Array of insights data records
     * @param {Object} config - Configuration object with settings
     * @return {Array} Data with processed links
     */
    processShortLinks(data, config = {}) {
      const {
        processShortLinks = false,
        shortLinkFields = ['link_url_asset'],
        maxConcurrentRequests = 5
      } = config;

      if (!processShortLinks || !data.length) {
        return data;
      }

      // Collect unique short links
      const shortLinks = this._collectUniqueShortLinks(data, shortLinkFields);
      
      if (shortLinks.length === 0) {
        return data;
      }

      // Resolve short links to full URLs (returns new objects)
      const resolvedShortLinks = this._resolveShortLinks(shortLinks, maxConcurrentRequests);

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
             urlParts[3];
    }

  //---- _resolveShortLinks -------------------------------------------------
    /**
     * Resolves short links to their full URLs
     * 
     * @param {Array} shortLinks - Array of short link objects
     * @param {number} maxConcurrentRequests - Max concurrent requests
     * @return {Array} New array with resolved URLs
     * @private
     */  
    _resolveShortLinks(shortLinks, maxConcurrentRequests) {
      const resolvedLinks = [];
      
      // Process in batches to avoid overwhelming the server
      for (let i = 0; i < shortLinks.length; i += maxConcurrentRequests) {
        const batch = shortLinks.slice(i, i + maxConcurrentRequests);
        
        batch.forEach(linkObj => {
          try {
            const response = EnvironmentAdapter.fetch(linkObj.originalUrl, {
              method: 'GET',
              followRedirects: false,
              muteHttpExceptions: true
            });
            
            const headers = response.getHeaders();
            const resolvedUrl = headers.Location || linkObj.originalUrl;
            
            // Create new object instead of mutating
            resolvedLinks.push({
              originalUrl: linkObj.originalUrl,
              resolvedUrl: resolvedUrl,
              parsedParams: null
            });
            
          } catch (error) {
            console.log(`Failed to resolve short link ${linkObj.originalUrl}: ${error.message}`);
            
            // Create new object with original URL as resolved
            resolvedLinks.push({
              originalUrl: linkObj.originalUrl,
              resolvedUrl: linkObj.originalUrl,
              parsedParams: null
            });
          }
        });
      }
      
      return resolvedLinks;
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
            if (resolvedUrl) {
              // Create new nested object instead of mutating
              const newUrlAsset = {
                ...urlAsset,
                parsed_url: resolvedUrl
              };
              
              // Update the nested object in the record
              this._setNestedValue(newRecord, fieldName, newUrlAsset);
            } else {
              // Even if no resolution, create new object with parsed_url = original
              const newUrlAsset = {
                ...urlAsset,
                parsed_url: urlAsset.website_url
              };
              
              this._setNestedValue(newRecord, fieldName, newUrlAsset);
            }
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
      const params = {};
      
      const paramPairs = queryString.includes('&') ? 
        queryString.split('&') : [queryString];
      
      paramPairs.forEach(pair => {
        if (pair.includes('=')) {
          const [key, value] = pair.split('=');
          if (key && value) {
            params[key] = decodeURIComponent(value);
          }
        }
      });

      return Object.keys(params).length > 0 ? params : null;
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