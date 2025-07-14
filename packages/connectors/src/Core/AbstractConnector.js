/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var AbstractConnector = class AbstractConnector {
  //---- constructor -------------------------------------------------
    constructor(config, source, storage = null) {

      if( typeof config.setParametersValues !== "function" ) { 
        throw new Error(`Unable to create a Connector. The first parameter must inherit from the AbstractConfig class`);
        
      } else if( typeof source.fetchData !== "function" ) {
        throw new Error(`Unable to create a Connector. The second parameter must inherit from the AbstractSource class`);

      // storage might be null in case it will be dynmicaly assigned in Connector.startImportProcess()
      } else if ( storage !== null && !(storage instanceof AbstractStorage) ) {
        throw new Error(`Unable to create a Connector. The third parameter must inherit from the AbstractStorage class`);
      }

      try {

        config.validate();

      } catch(error) {

        config.logMessage(`❌ ${error.stack}`);

        // in case current status is not In progress, we need to update it to "Error". We cannot overwrite "In progress" status with "Error" to avoid import dublication
        if( !config.isInProgress() ) {
          config.handleStatusUpdate({ 
            status: EXECUTION_STATUS.ERROR, 
            error: error
          });
        }

        throw error;

      }

      // if created directly, storageName is not passed as a parameter and we need to set it dynamically
      if (storage !== null) {
        this.storageName = storage.constructor.name;
      }
      
      this.config = config;
      this.source = source;
      this.storage = storage;

    }
    //----------------------------------------------------------------
      
  //---- run ---------------------------------------------------------
    /**
     * Initiates imports new data from a data source
     */
    run() {

      try {

        // if import is already in progress skip this run in order to avoid dublication 
        if( this.config.isInProgress() ) {

          this.config.logMessage("⚠️ Import is already in progress");
          this.config.addWarningToCurrentStatus();

        // stat a new import
        } else {

          this.config.logMessage("⚫️ Configuration was loaded successfully", true);
          this.config.handleStatusUpdate({ status: EXECUTION_STATUS.IMPORT_IN_PROGRESS });
          this.config.updateLastImportDate();
          this.config.logMessage("🟢 Start importing new data");

          if (this.storage !== null && this.storage.areHeadersNeeded()) {
            this.storage.addHeader(this.storage.uniqueKeyColumns);
            this.config.logMessage(`Column(s) for unique key was added: ${this.storage.uniqueKeyColumns}`);
          }

          this.startImportProcess();

          this.config.logMessage("✅ Import is finished");
          this.config.handleStatusUpdate({ 
            status: EXECUTION_STATUS.IMPORT_DONE
          });      
        }

        this.config.updateLastImportDate();

      } catch( error ) {

        this.config.handleStatusUpdate({ 
          status: EXECUTION_STATUS.ERROR, 
          error: error
        });
        this.config.logMessage(`❌ ${error.stack}`);
        throw error;

      }

    }
    //----------------------------------------------------------------  
    
  //---- startImportProcess ------------------------------------------
    /**
     * A method for calling from Root script for determining parameters needed to fetch new data.
     */
    startImportProcess() {
      
      let startDate = null;
      let endDate = new Date();
      let daysToFetch = null;
      [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

      if( !startDate ) {
        this.config.logMessage("There is nothing to import in this data range");
        return;
      }

      endDate.setDate(startDate.getDate() + daysToFetch);

      // fetching new data from a data source
      let data = this.source.fetchData(startDate, endDate);

      // there are fetched records to update
      if( !data.length ) {      
        
        this.config.logMessage("ℹ️ No records have been fetched");
        this.config.updateLastRequstedDate(endDate);

      } else {

        this.config.logMessage(`${data.length} rows were fetched`);
        this.storage.saveData(data);

      }

      this.config.updateLastRequstedDate(endDate);

    }
    //----------------------------------------------------------------
    
  //---- addMissingFieldsToData ---------------------------------
    /**
     * Ensures all fields selected in the configuration are present in each data record.
     * This is useful when API returns data without some fields that were selected.
     * 
     * @param {Array} data - Array of data records from the API
     * @param {Array} selectedFields - Array of field names selected in the configuration
     * @returns {Array} - Data with all selected fields present in each record
     */
    addMissingFieldsToData(data, selectedFields) {
      if (!data || !data.length || !selectedFields || !selectedFields.length) {
        return data;
      }
      
      return data.map(record => {
        const result = { ...record };
        
        // Add null values for any selected fields missing from the record
        selectedFields.forEach(fieldName => {
          if (!(fieldName in result)) {
            result[fieldName] = null;
          }
        });
        
        return result;
      });
    }
    //----------------------------------------------------------------

  //---- getStartDateAndDaysToFetch ----------------------------------
    /**
     * calculates start date and days to fetch time series data
     * @return StartData (date) and daysToFetch (integer)
     */
    getStartDateAndDaysToFetch() {

      let startDate = this.config.StartDate.value;
      let endDate  = new Date();
      let lastRequestedDate = null;

      // data wasn't fetched earlier
      if (this.config.EndDate && this.config.EndDate.value ) {
        endDate = this.config.EndDate.value;
      }
      
      // data wasn't fetched earlier
      if (!this.config.LastRequestedDate || !this.config.LastRequestedDate.value ) {
        lastRequestedDate = new Date(this.config.StartDate.value.getTime() );

      } else {
        if (typeof this.config.LastRequestedDate.value === 'string') {
          lastRequestedDate = new Date( this.config.LastRequestedDate.value );
        } else {
          lastRequestedDate = new Date( this.config.LastRequestedDate.value.getTime() );
        }
        lastRequestedDate.setDate( lastRequestedDate.getDate() - this.config.ReimportLookbackWindow.value );
      }
      // The earliest date that can be requested is the start date
      if( startDate.getTime() < lastRequestedDate.getTime() ) {
        startDate = lastRequestedDate;
      }

      // ensuring that data will not be requested for future 
      const daysToFetch = Math.max(
        0,
        Math.min (
          Math.floor( ( endDate.getTime() - startDate.getTime() ) / (1000 * 60 * 60 * 24) ) + 1, // days from startDate until today
          this.config.MaxFetchingDays.value 
        )
      )

      // data to start is after end date
      if( startDate > this.config.EndDate.value ) {
        return [null, 0];
      } else {
        return [startDate, daysToFetch];
      }

    }
    //----------------------------------------------------------------
}