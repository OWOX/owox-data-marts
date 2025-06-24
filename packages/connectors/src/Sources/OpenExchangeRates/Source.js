/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API Documentation: https://docs.openexchangerates.org/reference/historical-json

var OpenExchangeRatesSource = class OpenExchangeRatesSource extends AbstractSource {

constructor(config) {

  super( config.mergeParameters({
      AppId: {
        isRequired: true,
        requiredType: "string",
        errorMessage: "You need to add App Id first. Go to Google Sheets Menu ⟩ OWOX ⟩ 🔑 Manage Credentials'"
      },
      StartDate: {
        isRequired: true,
        requiredType: "date",
        default: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      },
      EndDate: {
        requiredType: "date",
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        value: 1
      },
      MaxFetchingDays: {
        requiredType: "number",
        isRequired: true,
        default: 30
      },
      Symbols: {
        requiredType: "string",
        requiredPattern: "" // @TODO: add support or regexp check of parameters value ^([A-Z]{3}|[A-Z]{3}(, ?[A-Z]{3})*)$
      },
      base: { // Please note: changing the API `base` currency is available for Developer, Enterprise and Unlimited plan clients
        requiredType: "string",
        isRequired: true,
        value: "USD"
      }
    }) );
    
    this.fieldsSchema = OpenExchangeRatesFieldsSchema;
  }
  
  
  /*
  @param date The requested date as a Date object
  
  @return data array
  
  */
  fetchData(date)  {
  
    let data = [];
    let base = this.config.base.value;
    let app_id = this.config.AppId.value;
    let symbols = '';
  
    // Limit results to specific currencies (comma-separated list of 3-letter codes)
    if( this.config.Symbols.value ) {
      symbols = '&symbols=' + String(this.config.Symbols.value).replace(/[^A-Z,]/g,"");
    }
   
    var date = EnvironmentAdapter.formatDate(date, "UTC", "yyyy-MM-dd"); // The requested date in YYYY-MM-DD format (required)
    const url = `https://openexchangerates.org/api/historical/${date}.json?base=${base}${symbols}&app_id=${app_id}`;
    
    this.config.logMessage(`🔄 Fetching rates for ${date}`);
  
    console.log(url);
  
    var response = EnvironmentAdapter.fetch(url, {'method': 'get', 'muteHttpExceptions': true} );
    var historical = JSON.parse( response.getContentText() );
  
    for (var currency in historical["rates"]) {
      data.push({
        date: new Date(date),
        base: base,
        currency: currency,
        rate: parseFloat(historical["rates"][ currency ])
      });
    };
  
    //console.log(data);
    return data;
  
  }
    
  }