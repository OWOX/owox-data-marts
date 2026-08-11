/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var FacebookMarketingConnector = class FacebookMarketingConnector extends AbstractConnector {

  // ---- constructor ------------------------------------
      constructor(config, source, storageName = "GoogleBigQueryStorage", runConfig = null) {
    
    super(config, source, null, runConfig);

    this.storageName = storageName;

    // accountId -> errors that made this account unreachable, kept so a partial failure can be
    // reported per account instead of collapsing into whichever error happened to come last
    this.skippedAccounts = new Map();

    }


//---- startImportProcess -------------------------------------------------
    async startImportProcess() {

      // Getting account IDs by splitting the configuration value by commas
      let accountsIds = String(this.config.AccountIDs.value).split(/[,;]\s*/);

      // Getting an object of nodes whose fields array needs to be fetched from
      let fields = this.config.Fields.value.split(", ").reduce( (acc, pair) => {
        let [key, value] = pair.split(" ");
        (acc[key] = acc[key] || []).push( value.trim() );
        return acc;
      }, {});

      let timeSeriesNodes = {};

      // Data must be imported differently depending on whether it is time-series or not
      for(var nodeName in fields) {

        if( nodeName in this.source.fieldsSchema && this.source.fieldsSchema[nodeName].isTimeSeries ) {

            timeSeriesNodes[nodeName] = fields[nodeName];

        // node's data is catalog like, it must be imported right away
        } else {

          await this.startImportProcessOfCatalogData(nodeName, accountsIds, fields[ nodeName ]);

        }

      }

      // if there are some time series nodes to import
      if( Object.keys(timeSeriesNodes).length > 0 ) {
        let startDate = null;
        let daysToFetch = null;
        [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

        if( daysToFetch > 0 ) {
          await this.startImportProcessOfTimeSeriesData(accountsIds, timeSeriesNodes, startDate, daysToFetch);
        }

      }

      // A run that skipped an account still completes, so without this the only trace would be a
      // log line: the run would report plain success while that account's data is missing.
      if( this.skippedAccounts.size ) {
        this.config.addWarningToCurrentStatus(
          `${this.skippedAccounts.size} out of ${accountsIds.length} accounts were skipped and their data is missing. `
          + `Skipped accounts: ${[...this.skippedAccounts.keys()].join(', ')}`
        );
      }

    }

  //---- skipOrRethrow -------------------------------------------------
    /**
     * Decides whether a failure lets the import move on to the next account.
     *
     * Only account-scoped permission failures are safe to skip: the account stays unreachable
     * however often it is retried, so continuing costs nothing. Everything else — a storage
     * write, an exhausted transient error — must fail the run: swallowing it would let
     * LastRequestedDate advance past a day whose data was never stored, and once
     * ReimportLookbackWindow has passed that day is never requested again.
     *
     * @param {string} accountId - The account being imported
     * @param {Error} error - The failure to classify
     * @param {string} context - What was being attempted, for the warning text
     * @throws {Error} The original error, when it is not an account-scoped permission failure
     * @private
     */
    _skipOrRethrow(accountId, error, context) {

      if( !error?.isWarning ) {
        throw error;
      }

      if( !this.skippedAccounts.has(accountId) ) {
        this.skippedAccounts.set(accountId, []);
      }
      this.skippedAccounts.get(accountId).push(error);

      this.config.addWarningToCurrentStatus(`${context}: skipped account ${accountId}: ${error.message}`);

    }

  //---- throwIfAllAccountsSkipped -------------------------------------------------
    /**
     * Fails the run when no account was importable.
     *
     * Every account failing at once is not a set of individual accounts losing access on the same
     * day: it points to a global cause, typically an expired access token. Reporting success there
     * would hide a total outage behind a run that imported nothing.
     *
     * @param {array} accountIds - Every account the run was asked to import
     * @param {Set} skipped - The accounts skipped in the current pass
     * @param {string} context - What was being imported, for the error text
     * @throws {Error} When every account was skipped
     * @private
     */
    _throwIfAllAccountsSkipped(accountIds, skipped, context) {

      if( !accountIds.length || skipped.size < accountIds.length ) {
        return;
      }

      const details = accountIds.map(accountId => {
        const errors = this.skippedAccounts.get(accountId) || [];
        const last = errors[errors.length - 1];
        return `${accountId}: ${last ? last.message : 'unknown error'}`;
      });

      const error = new Error(
        `All ${accountIds.length} accounts were skipped ${context}, so nothing was imported. `
        + `This points to a global failure, such as an expired access token, rather than individual `
        + `accounts being inaccessible. Errors: ${details.join('; ')}`
      );
      // Every skipped account was skipped because of a permission failure, which is something the
      // customer can act on: keep the readable message instead of a stack.
      error.isWarning = true;
      throw error;

    }
  
  //---- startImportProcessOfCatalogData -------------------------------------------------
    /*

    Imports catalog (not time seriesed) data

    @param nodeName string Node name
    @param accountsIds array list of account ids
    @param fields array list of fields

    */
    async startImportProcessOfCatalogData(nodeName, accountIds, fields) {

      const skipped = new Set();

      for(var i in accountIds) {

        let accountId = accountIds[i];

        try {

          const storage = await this.getStorageByNode(nodeName);

          let totalRows = 0;
          await this.source.fetchData(nodeName, accountId, fields, null,
            async (pageData) => {
              await storage.saveData(pageData);
              totalRows += pageData.length;
            }
          );

          // If no data was fetched but CreateEmptyTables is enabled, ensure the table exists
          if(!totalRows && this.config.CreateEmptyTables?.value) {
            await storage.saveData([]);
          }

          totalRows && this.config.logMessage(`${totalRows} rows of ${nodeName} were fetched for account ${accountId}`);

        // catalog nodes are imported before any time-series node, so an unreachable account here
        // would otherwise abort the whole run before a single day is requested
        } catch( error ) {

          this._skipOrRethrow(accountId, error, `Importing ${nodeName}`);
          skipped.add(accountId);

        }

      }

      this._throwIfAllAccountsSkipped(accountIds, skipped, `while importing ${nodeName}`);

    }
  
  //---- startImportProcessOfTimeSeriesData -------------------------------------------------
    /*

    Imports time series (not catalog) data

    @param accountsIds (array) list of account ids
    @param timeSeriesNodes (object) of properties, each is array of fields
    @param startDate (Data) start date
    @param daysToFetch (integer) days to import

    */
    async startImportProcessOfTimeSeriesData(accountsIds, timeSeriesNodes, startDate, daysToFetch = 1) {

      // start requesting data day by day from startDate to startDate + daysToFetch
      for(var daysShift = 0; daysShift < daysToFetch; daysShift++) {

        // reset per day: an account skipped today may well import tomorrow, and a token that
        // expires mid-run must not retroactively invalidate the days already completed
        const skipped = new Set();

        // itterating accounts
        for (let accountId of accountsIds) {

          try {

            // itteration nodes to fetch data
            for(var nodeName in timeSeriesNodes) {

              this.config.logMessage(`Start importing data for ${DateUtils.formatDate(startDate)}: ${accountId}/${nodeName}`);

              // fetching new data from a data source
              let data = await this.source.fetchData(nodeName, accountId, timeSeriesNodes[ nodeName ], startDate);

              if( data.length || this.config.CreateEmptyTables?.value ) {
                const storage = await this.getStorageByNode(nodeName);
                await storage.saveData(data);
              }

              this.config.logMessage(data.length ? `${data.length} records were fetched` : `No records have been fetched`);

            }

          // an account the token can no longer access must not abort the whole import
          } catch( error ) {

            this._skipOrRethrow(accountId, error, `Importing ${DateUtils.formatDate(startDate)}`);
            skipped.add( accountId );

          }

        }

        // Runs before the cursor moves: a day nobody could import must be requested again
        this._throwIfAllAccountsSkipped(accountsIds, skipped, `for ${DateUtils.formatDate(startDate)}`);

        // Only update LastRequestedDate for incremental runs
        if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
          this.config.updateLastRequstedDate(startDate);
        }
        startDate.setDate( startDate.getDate() + 1);  // let's move on to the next date

      }
    }
  
//---- getStorageName -------------------------------------------------
  /**
   *
   * @param nodeName string name of the node
   * @param requestedFields array list of requested fields
   * 
   * @return AbstractStorage 
   * 
   */
  async getStorageByNode(nodeName) {

    // initiate blank object for storages
    if( !("storages" in this) ) {
      this.storages = {};
    }

    if( !(nodeName in this.storages) ) {

      if( !("uniqueKeys" in this.source.fieldsSchema[ nodeName ]) ) {
        throw new Error(`Unique keys for '${nodeName}' are not defined in the fields schema`);
      }

      let uniqueFields = this.source.fieldsSchema[ nodeName ]["uniqueKeys"];

      this.storages[ nodeName ] = new globalThis[ this.storageName ](
        this.config.mergeParameters({
          DestinationSheetName: {value: this.source.fieldsSchema[nodeName].destinationName },
          DestinationTableName: { value: this.getDestinationName(nodeName, this.config, this.source.fieldsSchema[nodeName].destinationName) },
        }),
        uniqueFields,
        this.source.fieldsSchema[ nodeName ]["fields"],
        `${this.source.fieldsSchema[ nodeName ]["description"]} ${this.source.fieldsSchema[ nodeName ]["documentation"]}`
      );

      await this.storages[nodeName].init();
    }

    return this.storages[ nodeName ];

  }
  
  
}