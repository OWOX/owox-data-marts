/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

function quoteBigQueryIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function normalizeBigQueryType(type) {
  const normalized = String(type || '').toUpperCase();
  const aliases = {
    BOOLEAN: 'BOOL',
    FLOAT: 'FLOAT64',
    INTEGER: 'INT64',
  };
  return aliases[normalized] || normalized;
}

var GoogleBigQueryStorage = class GoogleBigQueryStorage extends AbstractStorage {
  //---- constructor -------------------------------------------------
    /**
     * Abstract class for Google BigQuery storage operations
     *
     * @param config (object) instance of AbstractConfig
     * @param uniqueKeyColumns (mixed) a name of column with unique key or array with columns names
     * @param schema (object) object with structure like {fieldName: {type: "number", description: "smth" } }
     * @param description (string) string with storage description }
     */
    constructor(config, uniqueKeyColumns, schema = null, description = null) {
    
      super(
        config.mergeParameters({
          DestinationLocation: {
            isRequired: "US",
            requiredType: "string"
          },
          DestinationDatasetID: {
            isRequired: true,
            requiredType: "string"
          },
          DestinationTableName: {
            isRequired: true,
            default: "Data"
          },
          DestinationProjectID: {
            isRequired: true,
            default: config.DestinationDatasetID.value.split(".")[0]
          },
          DestinationDatasetName: {
            isRequired: true,
            default: config.DestinationDatasetID.value.split(".")[1]
          },
          ProjectID: {
            isRequired: true,
            default: config.DestinationDatasetID.value.split(".")[0]
          },
          MaxBufferSize: {
            isRequired: true,
            default: 250
          },
          ServiceAccountJson: {
            isRequired: false,
            requiredType: "string",
            default: null
          },
          OAuthAccessToken: {
            isRequired: false,
            requiredType: "string",
            default: null
          },
          OAuthRefreshToken: {
            isRequired: false,
            requiredType: "string",
            default: null
          },
          OAuthClientId: {
            isRequired: false,
            requiredType: "string",
            default: null
          },
          OAuthClientSecret: {
            isRequired: false,
            requiredType: "string",
            default: null
          },
          OAuthAccessTokenExpiry: {
            isRequired: false,
            requiredType: "number",
            default: null
          }
        }),
        uniqueKeyColumns,
        schema,
        description
      );

      this.updatedRecordsBuffer = {};

      // Initialize counter for tracking total records processed
      this.totalRecordsProcessed = 0;

      // Cached across executeQuery() calls so a token refresh (triggered by
      // google-auth-library once the access token actually expires) persists
      // for the rest of the run instead of being rebuilt from the stale
      // original token on every single query.
      this._bigqueryClient = null;
    }

  //---- init --------------------------------------------------------
    /**
     * Initializing storage
     */
    async init() {

      this.checkIfGoogleBigQueryIsConnected();

      await this.loadTableSchema();

    }
  //----------------------------------------------------------------
  //---- loads Google BigQuery Table Schema ---------------------------
    async loadTableSchema() {

      this.existingColumns = await this.getAListOfExistingColumns() || {};

      // If there are no existing fields, it means the table has not been created yet
      if( Object.keys(this.existingColumns).length == 0 ) {
        await this.createDatasetIfItDoesntExist();
        this.existingColumns = await this.createTableIfItDoesntExist();
      } else {
        // Check if there are new columns from Fields config
        let selectedFields = this.getSelectedFields();
        let newFields = selectedFields.filter( column => !Object.keys(this.existingColumns).includes(column) );
        if( newFields.length > 0 ) {
          await this.addNewColumns(newFields);
        }
      }

    }


  //---- loads a list of columns exists in a table -------------------
    /**
     * Reads columns list of the table and returns it as object. Each property is a field name
     * 
     * @return columns (object)
     * 
     */
    async getAListOfExistingColumns() {

        let query = "----- Getting a list of existing columns ------\n";
        
        query += `DECLARE dataset_exists BOOL;
        SET dataset_exists = EXISTS (
          SELECT 1
          FROM \`${this.config.DestinationProjectID.value}.INFORMATION_SCHEMA.SCHEMATA\`
          WHERE schema_name = '${this.config.DestinationDatasetName.value}'
        );
        IF dataset_exists THEN 
          SELECT column_name, data_type, is_partitioning_column
          FROM \`${this.config.DestinationDatasetID.value}.INFORMATION_SCHEMA.COLUMNS\`
          WHERE table_name = '${this.config.DestinationTableName.value}'
          ORDER BY ordinal_position;
        END IF`;

        /*let query = `SELECT column_name, data_type
        FROM \`${this.config.DestinationDatasetID.value}.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = '${this.config.DestinationTableName.value}'`;*/

        let queryResults = await this.executeQuery(query);

        let columns = {};

        if( queryResults.rows ) {
          queryResults.rows.map(row => {
            columns[ row.f[0].v ]  = {"name": row.f[0].v, "type": row.f[1].v, "isPartitioningColumn": row.f[2].v === "YES"}
          });
        } else if (Array.isArray(queryResults)) {
          queryResults.map(row => {
            columns[ row.column_name ] = {"name": row.column_name, "type": row.data_type, "isPartitioningColumn": row.is_partitioning_column === "YES"}
          });
        }

        return columns;

    }


  //---- createDatasetIfItDoesntExist --------------------------------
    async createDatasetIfItDoesntExist() {

      let query = `---- Create Dataset if it not exists -----\n`;
      query += `CREATE SCHEMA IF NOT EXISTS \`${this.config.DestinationProjectID.value}.${this.config.DestinationDatasetName.value}\`
      OPTIONS (
        location = '${this.config.DestinationLocation.value}'
      )`;

      await this.executeQuery(query);

    }

  //---- createTableIfItDoesntExist ----------------------------------
    async createTableIfItDoesntExist(quoteColumnNames = false) {

      let columns = [];
      let columnPartitioned = null;
      let existingColumns = {};

      let selectedFields = this.getSelectedFields();
      let tableColumns = selectedFields.length > 0 ? selectedFields : this.uniqueKeyColumns;

      for (let i in tableColumns) {
        let columnName = tableColumns[i];
        let columnDescription = '';

        if( !(columnName in this.schema) ) {
          throw new Error(`Required field ${columnName} not found in schema`);
        }
        
        let columnType = this.getColumnType(columnName);
        
        if( "description" in this.schema[ columnName ] ) {
          columnDescription = ` OPTIONS(description="${this.obfuscateSpecialCharacters(this.schema[ columnName ]["description"])}")`;
        }

        // Last flagged column wins — LinkedIn flags two; existing tables
        // were created under this rule, so it must not change
        if( "GoogleBigQueryPartitioned" in this.schema[ columnName ]
        && this.schema[ columnName ]["GoogleBigQueryPartitioned"] ) {
          columnPartitioned = columnName;
        }

        const sqlColumnName = quoteColumnNames ? quoteBigQueryIdentifier(columnName) : columnName;
        columns.push(`${sqlColumnName} ${columnType}${columnDescription}`);
        
        existingColumns[ columnName ] = {"name": columnName, "type": columnType};

      }

      const primaryKeyColumns = quoteColumnNames
        ? this.uniqueKeyColumns.map(quoteBigQueryIdentifier)
        : this.uniqueKeyColumns;
      columns.push(`PRIMARY KEY (${primaryKeyColumns.join(",")}) NOT ENFORCED`);

      columns = columns.join(",\n");

      let query = `---- Creating table if it not exists -----\n`;
      query += `CREATE TABLE IF NOT EXISTS \`${this.config.DestinationDatasetID.value}.${this.config.DestinationTableName.value}\` (\n${columns})`

      if( columnPartitioned ) {
        const sqlName = quoteColumnNames ? quoteBigQueryIdentifier(columnPartitioned) : columnPartitioned;
        const partitionExpression = this.buildPartitionByExpression(sqlName, this.getColumnType(columnPartitioned));
        if( partitionExpression ) {
          query += `\nPARTITION BY ${partitionExpression}`;
          // Record table truth for buildPartitionPredicate in same-run flows
          existingColumns[ columnPartitioned ]["isPartitioningColumn"] = true;
        } else {
          // A silent skip here would ship a dead flag: the table is created
          // unpartitioned and every MERGE full-scans with no symptom but cost
          this.config.logMessage(`Column '${columnPartitioned}' has type '${this.getColumnType(columnPartitioned)}' which cannot be a partition column; creating the table without partitioning`);
        }
      }

      if( this.description ) {
        query += `\nOPTIONS(description="${this.description}")`;
      }

      await this.executeQuery(query);
      this.config.logMessage(`Table ${this.config.DestinationDatasetID.value}.${this.config.DestinationTableName.value} was created`);

      return existingColumns;

    }

  //---- replaceData -------------------------------------------------
    async replaceData(data) {

      this.checkIfGoogleBigQueryIsConnected();
      await this.createDatasetIfItDoesntExist();
      const liveTableName = this.config.DestinationTableName.value;
      const stagingTableName = this.createSnapshotTableName("staging");
      const originalExistingColumns = this.existingColumns;
      const originalTotalRecordsProcessed = this.totalRecordsProcessed;
      const originalQuoteFieldIdentifiers = this.quoteFieldIdentifiers;
      const liveColumns = await this.getAListOfExistingColumns();
      let stagingTableCreated = false;
      let published = false;

      try {
        this.config.DestinationTableName.value = stagingTableName;
        this.existingColumns = {};
        this.updatedRecordsBuffer = {};
        this.totalRecordsProcessed = 0;
        this.quoteFieldIdentifiers = true;
        stagingTableCreated = true;
        const stagedColumns = await this.createTableIfItDoesntExist(true);
        this.existingColumns = stagedColumns;

        if (data.length) {
          await this.saveData(data);
        }

        await this.validateSnapshotTable(stagingTableName, data);
        this.config.DestinationTableName.value = liveTableName;
        await this.publishSnapshotTable(
          stagingTableName,
          liveTableName,
          stagedColumns,
          this.hasSameSchema(liveColumns, stagedColumns, normalizeBigQueryType)
        );
        this.existingColumns = stagedColumns;
        this.updatedRecordsBuffer = {};
        published = true;

        this.config.logMessage(
          `Snapshot import completed for ${this.config.DestinationDatasetID.value}.${liveTableName}: ${data.length} rows`
        );
      } finally {
        this.config.DestinationTableName.value = liveTableName;
        this.updatedRecordsBuffer = {};
        this.totalRecordsProcessed = originalTotalRecordsProcessed;
        this.quoteFieldIdentifiers = originalQuoteFieldIdentifiers;
        if (!published) {
          this.existingColumns = originalExistingColumns;
        }

        if (stagingTableCreated) {
          try {
            await this.dropSnapshotTable(stagingTableName);
          } catch (error) {
            this.config.logMessage(`Could not clean up BigQuery snapshot staging table ${stagingTableName}: ${error.message}`);
          }
        }
      }
    }

  //---- snapshot helpers -------------------------------------------
    createSnapshotTableName(kind) {

      const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
      const suffix = `__owox_${kind}_${runId}`;
      return `${this.config.DestinationTableName.value.slice(0, 1024 - suffix.length)}${suffix}`;

    }

    async validateSnapshotTable(tableName, data) {

      const expectedRowCount = new Set(data.map(row => String(this.getUniqueKeyByRecordFields(row)))).size;
      const query = `SELECT COUNT(*) AS row_count FROM \`${this.config.DestinationDatasetID.value}.${tableName}\``;
      const results = await this.executeQuery(query);
      const rows = Array.isArray(results) ? results : (results && results.rows) || [];
      const actualRowCount = rows.length ? Number(rows[0].row_count ?? rows[0].f?.[0]?.v) : NaN;

      if (!Number.isFinite(actualRowCount) || actualRowCount !== expectedRowCount) {
        throw new Error(
          `BigQuery snapshot validation failed for ${tableName}: expected ${expectedRowCount} rows, got ${Number.isFinite(actualRowCount) ? actualRowCount : "an unreadable count"}`
        );
      }

    }

    publishSnapshotTable(stagingTableName, liveTableName, stagedColumns = {}, preserveTable = false) {

      const liveTable = quoteBigQueryIdentifier(
        `${this.config.DestinationDatasetID.value}.${liveTableName}`
      );
      const stagingTable = quoteBigQueryIdentifier(
        `${this.config.DestinationDatasetID.value}.${stagingTableName}`
      );
      const query = preserveTable
        ? (() => {
            const columns = Object.keys(stagedColumns).map(quoteBigQueryIdentifier).join(', ');
            return `BEGIN TRANSACTION;\nTRUNCATE TABLE ${liveTable};\nINSERT INTO ${liveTable} (${columns}) SELECT ${columns} FROM ${stagingTable};\nCOMMIT TRANSACTION;`;
          })()
        : `CREATE OR REPLACE TABLE ${liveTable} COPY ${stagingTable}`;
      return this.executeQuery(query);

    }

    dropSnapshotTable(tableName) {

      return this.executeQuery(`DROP TABLE IF EXISTS \`${this.config.DestinationDatasetID.value}.${tableName}\``);

    }


  //---- checkIfGoogleBigQueryIsConnected ---------------------
    checkIfGoogleBigQueryIsConnected() {

      if( typeof BigQuery == "undefined") {
        throw new Error(`BigQuery client library is not available. Ensure @google-cloud/bigquery is installed.`);
      }

    }

  //---- addNewColumns -----------------------------------------------
    /**
     * 
     * ALTER table by adding missed columns
     * 
     * @param {newColumns} array with a list of new columns
     * 
     */
    async addNewColumns(newColumns) {

      let query = '';
      let columns = [];

      // for each new column requested to be added to the table 
      for(var i in newColumns) {

        let columnName = newColumns[i];

        // checking the field is exists in schema
        if( columnName in this.schema ) {

          let columnDescription = '';
          
          let columnType = this.getColumnType(columnName);
          
          if( "description" in this.schema[ columnName ] ) {
            columnDescription = ` OPTIONS (description = "${this.obfuscateSpecialCharacters(this.schema[ columnName ]["description"])}")`;
          }

          columns.push(`ADD COLUMN IF NOT EXISTS ${columnName} ${columnType}${columnDescription}`);
          this.existingColumns[ columnName ] = {"name": columnName, "type": columnType};

        }

      }

      // there are columns to add to table
      if( columns != [] ) {
        query += `---- Adding new columns ----- \n`;
        query += `ALTER TABLE \`${this.config.DestinationDatasetID.value}.${this.config.DestinationTableName.value}\`\n\n`;
        query += columns.join(",\n");
        await this.executeQuery(query);
        this.config.logMessage(`Columns '${newColumns.join(",")}' were added to ${this.config.DestinationDatasetID.value} dataset`);
      }




    }

  //---- saveData ----------------------------------------------------
    /**
     * Saving data to a storage
     * @param {data} array of assoc objects with records to save
     */
    async saveData(data) {
           
      for (const row of data) {
      
        // if there are new columns in the first row it should be added first
        let newFields = Object.keys(row).filter( column => !Object.keys(this.existingColumns).includes(column) );
      
        if( newFields.length > 0 ) {
          // No console.log(newFields) here: an array pretty-prints across lines and the
          // backend records each as its own entry, and addNewColumns already logs them
          await this.addNewColumns(newFields);
        }
      
        this.addRecordToBuffer(row);
        await this.saveRecordsAddedToBuffer(this.config.MaxBufferSize.value);

      }

      await this.saveRecordsAddedToBuffer();
      
    }


  // ------- addReordTuBuffer ---------------------
    /**
     * @param {record} object
     */
    addRecordToBuffer(record) {
      
      //record = this.stringifyNeastedFields(record);
      let uniqueKey = this.getUniqueKeyByRecordFields( record );

      this.updatedRecordsBuffer[ uniqueKey ] = record;

    }
     

  //---- saveRecordsAddedToBuffer ------------------------------------
    /**
     * Add records from buffer to a sheet
     * @param (integer) {maxBufferSize} record will be added only if buffer size if larger than this parameter
     */
    async saveRecordsAddedToBuffer(maxBufferSize = 0) {

      let bufferSize = Object.keys( this.updatedRecordsBuffer ).length;
    
      // buffer must be saved only in case if it is larger than maxBufferSize
      if( bufferSize && bufferSize >= maxBufferSize ) {
        
        console.log(`Starting BigQuery MERGE operation for ${bufferSize} records...`);
        
        // Split buffer into smaller chunks if needed to avoid query size limits
        await this.executeQueryWithSizeLimit();
      }
    

    }

  //---- executeQueryWithSizeLimit ----------------------------------
    /**
     * Executes the MERGE query with automatic size reduction if it exceeds BigQuery limits
     */
    async executeQueryWithSizeLimit() {
      const bufferKeys = Object.keys(this.updatedRecordsBuffer);
      const totalRecords = bufferKeys.length;
      
      if (totalRecords === 0) {
        return;
      }
      
      // Try to execute with current buffer size, reduce recursively if too large
      await this.executeMergeQueryRecursively(bufferKeys, totalRecords);
      
      // Clear the buffer after processing
      this.updatedRecordsBuffer = {};
    }

  //---- executeMergeQueryRecursively --------------------------------
    /**
     * Recursively attempts to execute MERGE queries, reducing batch size if query is too large
     * @param {Array} recordKeys - Array of record keys to process
     * @param {number} batchSize - Current batch size to attempt
     */
    async executeMergeQueryRecursively(recordKeys, batchSize) {
      // Base case: if no records to process
      if (recordKeys.length === 0) {
        return;
      }
      
      // If batch size is 1 and still failing, we have a fundamental problem
      if (batchSize < 1) {
        throw new Error('Cannot process records: even single record query exceeds BigQuery size limit');
      }
      
      // Take a batch of records
      const currentBatch = recordKeys.slice(0, batchSize);
      const remainingRecords = recordKeys.slice(batchSize);
      
      // Build query for current batch
      const query = this.buildMergeQuery(currentBatch);
      
      // Check if query size exceeds limit (1024KB = 1,048,576 characters)
      const querySize = new Blob([query]).size;
      const maxQuerySize = 1024 * 1024; // 1MB in bytes
      
      if (querySize > maxQuerySize) {
        console.log(`Query size (${Math.round(querySize/1024)}KB) exceeds BigQuery limit. Reducing batch size from ${batchSize} to ${Math.floor(batchSize/2)}`);
        
        // Recursively try with half the batch size
        await this.executeMergeQueryRecursively(recordKeys, Math.floor(batchSize / 2));
        return;
      }
      
      try {
        // Execute the query
        await this.executeQuery(query);
        this.totalRecordsProcessed += currentBatch.length;
        console.log(`BigQuery MERGE completed successfully for ${currentBatch.length} records (Total processed: ${this.totalRecordsProcessed})`);
        
        // Process remaining records if any
        if (remainingRecords.length > 0) {
          await this.executeMergeQueryRecursively(remainingRecords, batchSize);
        }
        
      } catch (error) {
        // If query fails due to size (even though we checked), reduce batch size
        if (error.message && error.message.includes('query is too large')) {
          console.log(`Query execution failed due to size. Reducing batch size from ${batchSize} to ${Math.floor(batchSize/2)}`);
          await this.executeMergeQueryRecursively(recordKeys, Math.floor(batchSize / 2));
        } else {
          // Re-throw other errors
          throw error;
        }
      }
    }

  //---- formatColumnValue -------------------------------------------
    /**
     * Casts a record value to the string form used in generated SQL
     * @param {*} rawValue - the raw record value
     * @param {string} columnType - the BigQuery column type
     * @return {string|null} - the formatted value, or null for missing values
     */
    formatColumnValue(rawValue, columnType) {

      if (rawValue === undefined || rawValue === null) {
        return null;
      }

      const type = String(columnType).toUpperCase();
      // instanceof alone fails across realms (the Apps Script target); the
      // constructor-name fallback matches getUniqueKeyByRecordFields and
      // stringifyNeastedFields in AbstractStorage
      const isDateValue = rawValue instanceof Date
        || (typeof rawValue === "object" && rawValue.constructor && rawValue.constructor.name == "Date");

      if( type == "DATE" && isDateValue ) {
        return DateUtils.formatDate( rawValue );
      }

      if( (type == "DATETIME" || type == "TIMESTAMP") && isDateValue ) {
        // YYYY-MM-DD HH:MM:SS — toISOString is UTC, which is exactly what a
        // zone-less BigQuery TIMESTAMP literal denotes
        const isoString = rawValue.toISOString();
        return isoString.replace('T', ' ').substring(0, 19);
      }

      const stringValue = this.obfuscateSpecialCharacters( rawValue );

      if( type == "DATETIME" || type == "TIMESTAMP" ) {
        // 'T' and ' ' separators are equivalent to BigQuery; normalizing in
        // the shared helper keeps source rows and the partition predicate
        // comparable by construction rather than by coincidence
        return stringValue.replace("T", " ");
      }

      return stringValue;
    }

  //---- buildPartitionByExpression ----------------------------------
    /**
     * DDL expression for PARTITION BY, or null for types BigQuery cannot
     * partition by. DATETIME/TIMESTAMP columns need daily truncation.
     */
    buildPartitionByExpression(sqlColumnName, columnType) {
      switch( String(columnType).toUpperCase() ) {
        case "DATE": return sqlColumnName;
        case "DATETIME": return `DATETIME_TRUNC(${sqlColumnName}, DAY)`;
        case "TIMESTAMP": return `TIMESTAMP_TRUNC(${sqlColumnName}, DAY)`;
        default: return null;
      }
    }

  //---- isRealCalendarValue -----------------------------------------
    /**
     * True when a canonical 'YYYY-MM-DD[ HH:MM:SS]' string denotes a real
     * calendar date and time. The shape regex accepts impossible values like
     * 2026-02-31; SAFE_CAST turns those into NULL inside source rows, but a
     * typed literal in the predicate would fail the whole query.
     */
    isRealCalendarValue(value) {
      const [datePart, timePart] = value.split(" ");
      const [year, month, day] = datePart.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      // Date.UTC maps years 0-99 to 1900-1999, so this round-trip also
      // rejects years 0001-0099 (legal in BigQuery, absent in ad data).
      // Deliberate: the same quirk is what rejects garbage like '0000-00-00'.
      if( date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day ) {
        return false;
      }
      if( timePart ) {
        const [hours, minutes, seconds] = timePart.split(":").map(Number);
        if( hours > 23 || minutes > 59 || seconds > 59 ) {
          return false;
        }
      }
      return true;
    }

  //---- suppressPartitionPredicate ----------------------------------
    /**
     * Logs once per run why partition pruning is off — so a full-scan MERGE
     * is distinguishable from pruning working as intended — then returns
     * null for buildPartitionPredicate to pass through.
     */
    suppressPartitionPredicate(reason) {
      if( !this._partitionPredicateSuppressionLogged ) {
        this._partitionPredicateSuppressionLogged = true;
        this.config.logMessage(`Partition pruning is disabled for this run (${reason}); MERGE scans the whole table`);
      }
      return null;
    }

  //---- buildPartitionPredicate -------------------------------------
    /**
     * Builds a constant partition filter for the MERGE ON clause, so BigQuery
     * prunes partitions instead of scanning the whole target table.
     * `target.date = source.date` alone does not prune: the source is a
     * subquery of literals, and pruning needs a constant filter on the target.
     *
     * The partition column is taken from the destination table itself
     * (INFORMATION_SCHEMA, or recorded at CREATE TABLE time), not from the
     * schema flag: a legacy table can be partitioned by a different flagged
     * field, or by nothing at all.
     *
     * Returns null (no predicate, the MERGE falls back to a full table scan)
     * whenever the range cannot be derived safely: the destination table has
     * no partitioning column, that column is not part of the unique key, its
     * type is not date-like, no record carries a partition value, or a value
     * is not a real calendar date/time in canonical shape. Records with a
     * NULL partition value are skipped instead of suppressing the predicate:
     * their source rows can only INSERT, so no target range affects them.
     * Every suppression except the missing partition column logs its reason
     * once per run via suppressPartitionPredicate().
     *
     * @param {Array} recordKeys - Record keys of the batch being merged
     * @return {string|null} - SQL predicate for the target table, or null
     */
    buildPartitionPredicate(recordKeys) {

      // Exactly one fixed-width shape per type: min/max below compares strings
      // lexicographically, which matches chronological order only when every
      // value has the same width and no zone marker. Fractions, Z and offsets
      // are rejected on purpose — mixed shapes in one batch would let the
      // string min/max diverge from the true time range and produce a BETWEEN
      // that excludes rows the MERGE must see.
      const DATE_LIKE_LITERALS = {
        "DATE": /^\d{4}-\d{2}-\d{2}$/,
        "DATETIME": /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "TIMESTAMP": /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
      };

      // The destination table's real partitioning column, as reported by
      // INFORMATION_SCHEMA or recorded at CREATE TABLE time. The schema flag
      // is not trusted here: a legacy table can be partitioned by a different
      // flagged field (LinkedIn flags two), or by nothing at all.
      const partitionColumn = Object.keys(this.existingColumns).find(
        name => this.existingColumns[ name ] && this.existingColumns[ name ]["isPartitioningColumn"]
      );
      if( !partitionColumn ) {
        return null;
      }

      // The predicate is only safe when the partition column is part of the
      // unique key: the ON clause then already contains
      // `target.<col> = source.<col>`, so bounding the target changes nothing.
      // Without this, a matching target row in an out-of-range partition would
      // be invisible to the MERGE and its source row inserted as a duplicate.
      if( !this.uniqueKeyColumns || !this.uniqueKeyColumns.includes(partitionColumn) ) {
        return this.suppressPartitionPredicate(`partition column '${partitionColumn}' is not part of the unique key`);
      }

      const columnInfo = this.existingColumns[ partitionColumn ];

      const columnType = String(columnInfo.type).toUpperCase();
      const literalPattern = DATE_LIKE_LITERALS[ columnType ];
      if( !literalPattern ) {
        return this.suppressPartitionPredicate(`partition column '${partitionColumn}' has non-date type '${columnInfo.type}'`);
      }

      let minValue = null;
      let maxValue = null;

      for (const key of recordKeys) {
        const record = this.updatedRecordsBuffer[ key ];
        const value = this.formatColumnValue( record ? record[ partitionColumn ] : null, columnType );

        // A record without a partition value emits SAFE_CAST(NULL ...) in its
        // source row: NULL never equals any target value, so the row is an
        // INSERT either way and no target range can affect it — skip it
        // rather than giving up on pruning for the whole batch
        if( value === null ) {
          continue;
        }

        // One malformed value and the whole predicate is off: unlike NULL, a
        // string this regex rejects may still SAFE_CAST to a real value in
        // the source row, and a range that misses that row's partition would
        // hide its target row from the MERGE and insert a duplicate
        if( typeof value !== "string" || !literalPattern.test(value) || !this.isRealCalendarValue(value) ) {
          return this.suppressPartitionPredicate(`a record value in '${partitionColumn}' is not a canonical date/datetime`);
        }

        if( minValue === null || value < minValue ) minValue = value;
        if( maxValue === null || value > maxValue ) maxValue = value;
      }

      if( minValue === null ) {
        return this.suppressPartitionPredicate(`no record carries a value in partition column '${partitionColumn}'`);
      }

      const targetColumn = `target.${this.formatFieldIdentifier(partitionColumn)}`;
      return `${targetColumn} BETWEEN ${columnType} '${minValue}' AND ${columnType} '${maxValue}'`;
    }

  //---- buildMergeQuery ---------------------------------------------
    /**
     * Builds a MERGE query for the specified record keys
     * @param {Array} recordKeys - Array of record keys to include in the query
     * @return {string} - The constructed MERGE query
     */
    buildMergeQuery(recordKeys) {
      let rows = [];

      for(let i = 0; i < recordKeys.length; i++) {
        const key = recordKeys[i];
        let record = this.stringifyNeastedFields( this.updatedRecordsBuffer[key] );
        let fields = [];

        for(var j in this.existingColumns) {

          let columnName = this.existingColumns[j]["name"];
          let columnType = this.existingColumns[j]["type"];
          let columnValue = this.formatColumnValue( record[ columnName ], columnType );

          if (columnValue === null) {
            fields.push(`SAFE_CAST(NULL AS ${columnType}) ${this.formatFieldIdentifier(columnName)}`);
          } else {
            fields.push(`SAFE_CAST("${columnValue}" AS ${columnType}) ${this.formatFieldIdentifier(columnName)}`);
          }

        }

        rows.push(`SELECT ${fields.join(",\n\t")}`);
      }
       
      let existingColumnsNames = Object.keys(this.existingColumns);

      // Constant filter on the target's partition column enables partition
      // pruning; without it every MERGE scans the whole destination table
      const partitionPredicate = this.buildPartitionPredicate(recordKeys);

      let query = `MERGE INTO \`${this.config.DestinationDatasetID.value}.${this.config.DestinationTableName.value}\` AS target
      USING (
        ${rows.join("\n\nUNION ALL\n\n")}
      ) AS source

      ON ${this.uniqueKeyColumns.map(item => (`target.${this.formatFieldIdentifier(item)} = source.${this.formatFieldIdentifier(item)}`)).join("\n AND ")}${partitionPredicate ? `\n AND ${partitionPredicate}` : ""}

        WHEN MATCHED THEN
        UPDATE SET
          ${existingColumnsNames.map(item => `target.${this.formatFieldIdentifier(item)} = source.${this.formatFieldIdentifier(item)}`).join(",\n")}
        WHEN NOT MATCHED THEN
        INSERT (
          ${existingColumnsNames.map(item => this.formatFieldIdentifier(item)).join(", ")}
        )
        VALUES (
          ${existingColumnsNames.map(item => `source.${this.formatFieldIdentifier(item)}`).join(", ")}
        )`;

      return query;
    }

    formatFieldIdentifier(fieldName) {
      return this.quoteFieldIdentifiers ? quoteBigQueryIdentifier(fieldName) : fieldName;
    }
 

  //---- getBigQueryClient ---------------------------------------------
    /**
     * Builds (once) and caches the BigQuery client for this run.
     *
     * Reusing a single OAuth2Client instance across the whole run, rather than
     * rebuilding one from the same static access token on every query, lets
     * google-auth-library detect real token expiry (via expiry_date) and
     * refresh it in place using the refresh token — instead of silently
     * resending an access token that went stale hours into a long backfill.
     *
     * Known limitation: a token refreshed here lives only in this process and
     * is never written back to the stored credential, because the storage side
     * has no CREDENTIALS_UPDATE channel like the source side does. A run whose
     * stored token had already expired before it started therefore still fails
     * on its first query. Fixing that needs token write-back, not more caching.
     *
     * @return {BigQuery}
     */
    getBigQueryClient() {
      if (this._bigqueryClient) {
        return this._bigqueryClient;
      }

      if (this.config.OAuthAccessToken && this.config.OAuthAccessToken.value) {
        const { OAuth2Client } = require('google-auth-library');
        const oauth2Client = new OAuth2Client(
          this.config.OAuthClientId.value,
          this.config.OAuthClientSecret.value
        );
        oauth2Client.setCredentials({
          access_token: this.config.OAuthAccessToken.value,
          refresh_token: this.config.OAuthRefreshToken?.value || undefined,
          // `??`, not `||`: 0 is a valid number and must not be silently
          // dropped on our side. Note google-auth-library's own
          // isTokenExpiring() also treats 0 as "no known expiry" (falsy
          // check), so an exact epoch-0 expiry never triggers a refresh
          // either way — acceptable, since a real expiry is never 0.
          expiry_date: this.config.OAuthAccessTokenExpiry?.value ?? undefined,
        });
        this._bigqueryClient = new BigQuery({
          projectId: this.config.ProjectID.value,
          authClient: oauth2Client,
        });
      } else if (this.config.ServiceAccountJson && this.config.ServiceAccountJson.value) {
        const { JWT } = require('google-auth-library');
        const credentials = JSON.parse(this.config.ServiceAccountJson.value);
        const authClient = new JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes: ['https://www.googleapis.com/auth/bigquery'],
        });
        this._bigqueryClient = new BigQuery({
          projectId: this.config.ProjectID.value || credentials.project_id,
          authClient
        });
      } else {
        throw new Error("Either OAuth token or Service Account JSON is required to connect to Google BigQuery");
      }

      return this._bigqueryClient;
    }

  //---- query -------------------------------------------------------
    /**
     * Executes Google BigQuery Query and returns a result
     *
     * @param {query} string
     *
     * @return Promise<object>
     *
     */
    async executeQuery(query) {
      const bigqueryClient = this.getBigQueryClient();

      const options = {
        query: query,
        useLegacySql: false,
      };

      const [job] = await bigqueryClient.createQueryJob(options);
      const [rows] = await job.getQueryResults();
      return rows;
    }

  //---- obfuscateSpecialCharacters ----------------------------------
    obfuscateSpecialCharacters(inputString) {
  
      return String(inputString).replace(/\\/g, '\\\\').replace(/[\x00-\x1F]/g, ' ').replace(/'/g, "\\'").replace(/"/g, '\\"'); 
  
    }

  //---- getColumnType -----------------------------------------------
    /**
     * Get column type for BigQuery from schema
     * @param {string} columnName - Name of the column
     * @returns {string} BigQuery column type
     */
    getColumnType(columnName) {
      return this._convertTypeToStorageType(this.schema[columnName]["type"]);
    }

  //---- _convertTypeToStorageType ------------------------------------
    /**
     * Converts generic type to BigQuery-specific type.
     * Now uses UPPERCASE types from DataTypes constant.
     * @param {string} genericType - Generic type from schema (UPPERCASE)
     * @returns {string} BigQuery column type
     */
    _convertTypeToStorageType(genericType) {
      if (!genericType) return 'STRING';

      switch (genericType) {
        // Integer type
        case DATA_TYPES.INTEGER:
          return 'INT64';

        // Number type
        case DATA_TYPES.NUMBER:
          return 'FLOAT64';

        // Boolean type
        case DATA_TYPES.BOOLEAN:
          return 'BOOL';

        // Date/time types
        case DATA_TYPES.DATE:
          return 'DATE';
        case DATA_TYPES.DATETIME:
          return 'DATETIME';
        case DATA_TYPES.TIMESTAMP:
          return 'TIMESTAMP';
        case DATA_TYPES.TIME:
          return 'TIME';

        // String type
        case DATA_TYPES.STRING:
          return 'STRING';

        // Array and Object types (serialized as JSON strings)
        case DATA_TYPES.ARRAY:
        case DATA_TYPES.OBJECT:
          return 'STRING';

        default:
          throw new Error(`Unknown type: ${genericType}`);
      }
    }

}
