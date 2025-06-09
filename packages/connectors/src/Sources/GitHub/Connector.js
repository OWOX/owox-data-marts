/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var GitHubConnector = class GitHubConnector extends AbstractConnector {

 /**
     * A method for calling from Root script for determining parameters needed to fetch new data.
     */
    startImportProcess() {

      // fetching new data from a data source
      let data = this.source.fetchData();

      // there are fetched records to update
      if( !data.length ) {      
        
        this.config.logMessage("ℹ️ No records have been fetched");
        this.config.updateLastRequstedDate(endDate);

      } else {

        this.config.logMessage(`${data.length} rows were fetched`);
        this.storage.saveData(data);

      }

    }

}