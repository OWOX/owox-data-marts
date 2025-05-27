/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var BankOfCanadaConnector = class BankOfCanadaConnector extends AbstractConnector {

constructor( configRange ) {

  super( configRange.mergeParameters({
    StartDate: {
      isRequired: true,
      requiredType: "date",
      default: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    },
    EndDate: {
      requiredType: "date"
    },
    ReimportLookbackWindow: {
      requiredType: "number",
      isRequired: true,
      value: 2
    },
    CleanUpToKeepWindow: {
      requiredType: "number"
    },
    DestinationSheetName: {
      isRequired: true,
      value: "Data"
    },
    MaxFetchingDays: {
      requiredType: "number",
      isRequired: true,
      value: 30
    }
  }));

  
}
  
/*
@param startDate start date
@param endDate end date

@return data array

*/
fetchData(startDate, endDate)  {

  let data = [];
  
  const start_date = EnvironmentAdapter.formatDate(startDate, "UTC", "yyyy-MM-dd");
  const end_date = EnvironmentAdapter.formatDate(endDate, "UTC", "yyyy-MM-dd");

  const url = `https://www.bankofcanada.ca/valet/observations/group/FX_RATES_DAILY/json?start_date=${start_date}&end_date=${end_date}`;
    
  this.config.logMessage(`🔄 Fetching data from ${start_date} to ${end_date}`);

  var response = EnvironmentAdapter.fetch(url, {'method': 'get', 'muteHttpExceptions': true} );
  var rates = JSON.parse( response.getContentText() );

  rates["observations"].forEach((observation) => {
      let date = new Date(observation["d"]);
      //date = date.setDate( date.getTime() - 5 * 60 * 60 * 1000 ); // Bank of Canada provides rates in Toronto time zone @TODO: for some dates it is 4 (!) hours, not 5
      delete observation["d"];

      for(var currency in observation) {
        data.push({
          date: date,
          label: currency.substring(2),
          rate: parseFloat(observation[ currency ]["v"])
        });
      }

  });

  //console.log(data);
  return data;

}
    
}