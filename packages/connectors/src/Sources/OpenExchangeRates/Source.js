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
        label: "App ID",
        description: "OpenExchangeRates API App ID",
        errorMessage: "You need to add App Id first. Go to Google Sheets Menu ⟩ OWOX ⟩ 🔑 Manage Credentials'",
        attributes: [CONFIG_ATTRIBUTES.SECRET]
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
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2,
        label: "Reimport Lookback Window",
        description: "Number of days to look back when reimporting data"
      },
      MaxFetchingDays: {
        requiredType: "number",
        isRequired: true,
        default: 30,
        label: "Max Fetching Days",
        description: "Maximum number of days to fetch data for"
      },
      Symbols: {
        requiredType: "string",
        label: "Currency Symbols",
        description: "Comma-separated list of currency codes to fetch (e.g., USD,EUR,GBP)"
      },
      base: { // Please note: changing the API `base` currency is available for Developer, Enterprise and Unlimited plan clients
        requiredType: "string",
        isRequired: true,
        default: "USD",
        label: "Base Currency",
        description: "Base currency for exchange rates (available for Developer+ plans)"
      },
      CreateEmptyTables: {
        requiredType: "boolean",
        default: true,
        label: "Create Empty Tables",
        description: "Create tables with all columns even if no data is returned from API"
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
    const urlWithoutKey = `https://openexchangerates.org/api/historical/${date}.json?base=${base}${symbols}`;
    console.log(`OpenExchangeRates API URL:`, urlWithoutKey);
    
    const url = `${urlWithoutKey}&app_id=${app_id}`;
    
    this.config.logMessage(`🔄 Fetching rates for ${date}`);
  
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