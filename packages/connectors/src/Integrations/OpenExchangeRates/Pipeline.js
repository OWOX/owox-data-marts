/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var OpenExchangeRatesPipeline = class OpenExchangeRatesPipeline extends AbstractPipeline {


/*

A method for invoking importNewData() to determine the parameters required for fetching new data

*/
startImportProcess() {

  let startDate = null;
  let daysToFetch = null;
  [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

  // start requesting data day by day from startDate to startDate + MaxFetchingDays
  for(var daysShift = 0; daysShift < daysToFetch; daysShift++) {

    // fetching new data from a data source  
    let data = this.connector.fetchData(startDate);

    // there are fetched records to update
    if( !data.length ) {      
      
      if( daysShift == 0) {
        this.config.logMessage("ℹ️ No records have been fetched");
      }

    } else {

      this.config.logMessage(`${data.length} rows were fetched`);
      this.storage.saveData(data);

    }

    this.config.updateLastRequstedDate(startDate);
    startDate.setDate( startDate.getDate() + 1);  // let's move on to the next date

  }    

}


}