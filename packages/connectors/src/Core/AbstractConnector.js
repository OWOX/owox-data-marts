/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var AbstractConnector = class AbstractConnector {
  //---- constructor -------------------------------------------------
    constructor(config, source, storage = null, runConfig = null) {

      if( typeof config.setParametersValues !== "function" ) { 
        throw new Error(`Unable to create a Connector. The first parameter must inherit from the AbstractConfig class`);
        
      } else if( typeof source.fetchData !== "function" ) {
        throw new Error(`Unable to create a Connector. The second parameter must inherit from the AbstractSource class`);

      // storage might be null in case it will be dynmicaly assigned in Connector.startImportProcess()
      } else if ( storage !== null && !(storage instanceof AbstractStorage) ) {
        throw new Error(`Unable to create a Connector. The third parameter must inherit from the AbstractStorage class`);
      }

      // Set default run config if not provided (fallback for backwards compatibility)
      this.runConfig = runConfig || new AbstractRunConfig();

      try {

        config.validate();
        this.runConfig.validate(config);

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

      // Apply run config to the configuration
      this._processRunConfig();

    }
    //----------------------------------------------------------------
      
  //---- _processRunConfig -------------------------------------------
    /**
     * Processes run configuration and applies it to the connector config
     * @private
     */
    _processRunConfig() {
      if (this.runConfig.type === RUN_CONFIG_TYPE.MANUAL_BACKFILL) {
        // Apply manual backfill parameters
        this.runConfig.data.forEach(item => { 
          if (this.config[item.configField] && 
              this.config[item.configField].attributes && 
              this.config[item.configField].attributes.includes(CONFIG_ATTRIBUTES.MANUAL_BACKFILL)) {
            
            // Convert date strings to Date objects if needed
            let value = item.value;
            if (this.config[item.configField].requiredType === 'date' && typeof value === 'string') {
              value = new Date(value);
            }
            
            this.config[item.configField].value = value;
          }
        });
        
        this.config.logMessage(`🔧 Manual Backfill mode activated with custom parameters`);
        
      } else if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.logMessage(`🔄 Incremental mode activated`);
      }
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
        
        // Only update LastRequestedDate for incremental runs
        if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(endDate);
        }

      } else {

        this.config.logMessage(`${data.length} rows were fetched`);
        this.storage.saveData(data);

      }

      // Only update LastRequestedDate for incremental runs
      if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
      this.config.updateLastRequstedDate(endDate);
      }

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

      if (this.runConfig.type === RUN_CONFIG_TYPE.MANUAL_BACKFILL) {
        return this._getManualBackfillDateRange();
        
      } else if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        return this._getIncrementalDateRange();
        
      } else {
        throw new Error(`Unknown RunConfig type: ${this.runConfig.type}`);
      }
    }
    //----------------------------------------------------------------

  //---- _getManualBackfillDateRange ---------------------------------
    /**
     * Calculates date range for manual backfill
     * @return [startDate, daysToFetch]
     * @private
     */
    _getManualBackfillDateRange() {
      if (!this.config.StartDate.value) {
        throw new Error('StartDate is required for manual backfill');
      }
      let startDate = this.config.StartDate.value;
      let endDate = this.config.EndDate.value || new Date();
      const today = new Date();

      // Validate that EndDate is not earlier than StartDate
      if (endDate < startDate) {
        throw new Error(`EndDate (${endDate.toISOString().split('T')[0]}) cannot be earlier than StartDate (${startDate.toISOString().split('T')[0]})`);
      }
      
      // Validate that dates are not in the future
      if (startDate > today) {
        throw new Error(`StartDate (${startDate.toISOString().split('T')[0]}) cannot be in the future`);
        }
      
      if (endDate > today) {
        this.config.logMessage(`⚠️ Warning: EndDate (${endDate.toISOString().split('T')[0]}) is in the future, adjusting to today`);
        endDate = today;
      }

      // Calculate days between start and end date (no MaxFetchingDays limit for manual backfill)
      const daysToFetch = Math.max(
        0,
        Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      );
      
      return [startDate, daysToFetch];
    }
    //----------------------------------------------------------------

  //---- _getIncrementalDateRange ------------------------------------
    /**
     * Calculates date range for incremental import
     * @return [startDate, daysToFetch]
     * @private
     */
    _getIncrementalDateRange() {
      let startDate = this._getIncrementalStartDate();
      
      // Calculate days to fetch directly (limited by MaxFetchingDays and today)
      const today = new Date();
      const maxDaysToToday = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const daysToFetch = Math.max(0, Math.min(this.config.MaxFetchingDays.value, maxDaysToToday));

      return [startDate, daysToFetch];
    }
    //----------------------------------------------------------------

  //---- _getIncrementalStartDate ------------------------------------
    /**
     * Determines start date for incremental import considering lookback
     * @return Date
     * @private
     */
    _getIncrementalStartDate() {
      // If lastRequestedDate exists, always use it (ignore StartDate)
      if (this.config.LastRequestedDate && this.config.LastRequestedDate.value) {
        let lastRequestedDate = this._parseLastRequestedDate();
        let lookbackDate = this._applyLookbackWindow(lastRequestedDate);
        return lookbackDate;
      }

      // If StartDate exists, use it
      if (this.config.StartDate && this.config.StartDate.value) {
        return this.config.StartDate.value;
      }

      // If neither LastRequestedDate nor StartDate exists, use today's date
      return new Date();
    }
    //----------------------------------------------------------------

  //---- _parseLastRequestedDate -------------------------------------
    /**
     * Parses LastRequestedDate from config (handles both string and Date types)
     * @return Date
     * @private
     */
    _parseLastRequestedDate() {
      if (typeof this.config.LastRequestedDate.value === 'string') {
        return new Date(this.config.LastRequestedDate.value);
      } else {
        return new Date(this.config.LastRequestedDate.value.getTime());
      }
    }
    //----------------------------------------------------------------

  //---- _applyLookbackWindow ----------------------------------------
    /**
     * Applies ReimportLookbackWindow to a date
     * @param Date date
     * @return Date
     * @private
     */
    _applyLookbackWindow(date) {
      return new Date(date.getTime() - this.config.ReimportLookbackWindow.value * 24 * 60 * 60 * 1000);
    }
    //----------------------------------------------------------------

  //---- getDestinationName ----------------------------------
    /**
     * Resolves destination table name for a given node.
     * Looks for an override in `config.DestinationTableNameOverride` using the format:
     * "NodeA NewNameA, NodeB NewNameB". If an override for the `nodeName` is found,
     * it returns the corresponding `NewName`; otherwise returns `defaultName`.
     *
     * @param {string} nodeName - Name of the node to resolve the destination name for
     * @param {Object} config - Connector configuration object
     * @param {string} defaultName - Fallback destination table name
     * @returns {string} - Overridden destination name if present, otherwise `defaultName`
     */
    getDestinationName(nodeName, config, defaultName) {
      const raw = config?.DestinationTableNameOverride?.value;
      if (!raw) return defaultName;

      const match = raw
        .split(',')
        .map(s => s.trim())
        .find(s => s.startsWith(nodeName + ' '));

      return match ? match.slice(nodeName.length).trim() : defaultName;
    }
    //----------------------------------------------------------------
}
