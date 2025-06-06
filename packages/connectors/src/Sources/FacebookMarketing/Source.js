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
    
  }