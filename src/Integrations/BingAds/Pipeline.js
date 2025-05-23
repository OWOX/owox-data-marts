/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var BingPipeline = class BingPipeline extends AbstractPipeline {
  //---- startImportProcess ------------------------------------------
    /**
     * A method for invoking importNewData() to determine the parameters required for fetching new data
     */
    startImportProcess() {
      // initialization
        let startDate = null;
        let daysToFetch = null;
        [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();
        let endDate = startDate ? new Date(startDate.getTime() + (daysToFetch-1)*24*60*60*1000) : new Date();
      
      // requesting data by all the date range
        // fetching new data from a data source
          let data = this.connector.fetchData(startDate, endDate);

        // there are fetched records to update
          if( !data.length ) {
            this.config.logMessage("ℹ️ No records have been fetched");
          } else {
            this.config.logMessage(`${data.length} rows were fetched`);
            this.storage.saveData(data);
          }
          this.config.updateLastRequstedDate(endDate);
    }
    //----------------------------------------------------------------
}