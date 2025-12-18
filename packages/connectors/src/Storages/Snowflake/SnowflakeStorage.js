/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Helper function to quote identifier if not already quoted
 * @param {string} identifier - The identifier to quote
 * @returns {string} - Quoted identifier
 */
function quoteIdentifier(identifier) {
  if (!identifier) return identifier;
  // If already quoted, return as-is
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier;
  }
  // Otherwise, add quotes
  return `"${identifier}"`;
}

var SnowflakeStorage = class SnowflakeStorage extends AbstractStorage {
  //---- constructor -------------------------------------------------
    /**
     * Snowflake storage operations class
     *
     * @param config (object) instance of AbstractConfig
     * @param uniqueKeyColumns (mixed) a name of column with unique key or array with columns names
     * @param schema (object) object with structure like {fieldName: {type: "number", description: "smth" } }
     * @param description (string) string with storage description }
     */
    constructor(config, uniqueKeyColumns, schema = null, description = null) {

      super(
        config.mergeParameters({
          SnowflakeAccount: {
            isRequired: true,
            requiredType: "string"
          },
          SnowflakeWarehouse: {
            isRequired: true,
            requiredType: "string"
          },
          SnowflakeDatabase: {
            isRequired: true,
            requiredType: "string"
          },
          SnowflakeSchema: {
            isRequired: true,
            requiredType: "string"
          },
          SnowflakeRole: {
            isRequired: false,
            requiredType: "string",
            default: null
          },
          SnowflakeUsername: {
            isRequired: true,
            requiredType: "string"
          },
          SnowflakePassword: {
            isRequired: true,
            requiredType: "string"
          },
          SnowflakeAuthenticator: {
            isRequired: false,
            requiredType: "string",
            default: "SNOWFLAKE"
          },
          SnowflakePrivateKey: {
            isRequired: false,
            requiredType: "string",
            default: null
          },
          SnowflakePrivateKeyPassphrase: {
            isRequired: false,
            requiredType: "string",
            default: null
          },
          DestinationTableName: {
            isRequired: true,
            requiredType: "string",
            default: "Data"
          },
          MaxBufferSize: {
            isRequired: true,
            default: 250
          }
        }),
        uniqueKeyColumns,
        schema,
        description
      );

      this.updatedRecordsBuffer = {};
      this.totalRecordsProcessed = 0;
      this.connection = null;

    }

  //---- init --------------------------------------------------------
    /**
     * Initializing storage - establishes connection and creates table if needed
     */
    async init() {

      this.checkIfSnowflakeIsConnected();
      await this.createConnection();
      await this.testConnection();
      await this.loadTableSchema();

    }
  //----------------------------------------------------------------

  //---- checkIfSnowflakeIsConnected ---------------------------------
    checkIfSnowflakeIsConnected() {

      if( typeof snowflake == "undefined") {
        throw new Error(`Snowflake SDK is not available. Ensure snowflake-sdk is installed.`);
      }

    }
  //----------------------------------------------------------------

  //---- createConnection --------------------------------------------
    /**
     * Creates and connects to Snowflake
     */
    async createConnection() {
      snowflake.configure({
        logLevel: 'OFF',
      });

      const connectionConfig = {
        account: this.config.SnowflakeAccount.value,
        username: this.config.SnowflakeUsername.value,
        password: this.config.SnowflakePassword.value,
        warehouse: this.config.SnowflakeWarehouse.value,
        database: this.config.SnowflakeDatabase.value,
        schema: this.config.SnowflakeSchema.value,
        authenticator: this.config.SnowflakeAuthenticator.value || 'SNOWFLAKE'
      };

      // Add optional role
      if (this.config.SnowflakeRole && this.config.SnowflakeRole.value) {
        connectionConfig.role = this.config.SnowflakeRole.value;
      }

      // Add private key auth if configured
      if (this.config.SnowflakePrivateKey && this.config.SnowflakePrivateKey.value) {
        connectionConfig.privateKey = this.config.SnowflakePrivateKey.value;
        if (this.config.SnowflakePrivateKeyPassphrase && this.config.SnowflakePrivateKeyPassphrase.value) {
          connectionConfig.privateKeyPassphrase = this.config.SnowflakePrivateKeyPassphrase.value;
        }
      }

      this.connection = snowflake.createConnection(connectionConfig);

      // Connect with promise
      return new Promise((resolve, reject) => {
        this.connection.connect((err, conn) => {
          if (err) {
            reject(new Error(`Failed to connect to Snowflake: ${err.message}`));
          } else {
            this.config.logMessage(`Connected to Snowflake (account: ${this.config.SnowflakeAccount.value})`);
            resolve(conn);
          }
        });
      });
    }
  //----------------------------------------------------------------

  //---- testConnection ----------------------------------------------
    /**
     * Tests the connection with a simple query
     */
    async testConnection() {
      try {
        await this.executeQuery('SELECT 1 as test');
        this.config.logMessage('Snowflake connection established successfully');
      } catch (error) {
        throw new Error(`Snowflake connection test failed: ${error.message}`);
      }
    }
  //----------------------------------------------------------------

  //---- loadTableSchema ---------------------------------------------
    /**
     * Loads existing table schema from Snowflake
     */
    async loadTableSchema() {

      this.existingColumns = await this.getAListOfExistingColumns() || {};

      // If there are no existing fields, it means the table has not been created yet
      if( Object.keys(this.existingColumns).length == 0 ) {
        await this.createDatabaseAndSchemaIfNotExist();
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
  //----------------------------------------------------------------

  //---- getAListOfExistingColumns -----------------------------------
    /**
     * Reads columns list of the table and returns it as object
     *
     * @return columns (object)
     */
    async getAListOfExistingColumns() {

      let query = `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM ${this.config.SnowflakeDatabase.value}.INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_CATALOG = '${this.config.SnowflakeDatabase.value}'
          AND TABLE_SCHEMA = UPPER('${this.config.SnowflakeSchema.value}')
          AND TABLE_NAME = UPPER('${this.config.DestinationTableName.value}')
        ORDER BY ORDINAL_POSITION`;

      let queryResults = [];

      try {
        queryResults = await this.executeQuery(query);
      } catch (error) {
        // If table doesn't exist, return empty columns
        if (error.message && error.message.includes('does not exist')) {
          return {};
        }
        throw error;
      }

      let columns = {};

      if (Array.isArray(queryResults)) {
        queryResults.forEach(row => {
          const columnName = row.COLUMN_NAME;
          const dataType = row.DATA_TYPE;
          columns[columnName] = {"name": columnName, "type": dataType};
        });
      }

      return columns;

    }
  //----------------------------------------------------------------

  //---- createDatabaseAndSchemaIfNotExist ---------------------------
    async createDatabaseAndSchemaIfNotExist() {

      // Create database if not exists
      let createDbQuery = `CREATE DATABASE IF NOT EXISTS ${this.config.SnowflakeDatabase.value}`;
      await this.executeQuery(createDbQuery);

      // Create schema if not exists (quote schema name to preserve case)
      const quotedSchema = quoteIdentifier(this.config.SnowflakeSchema.value);
      let createSchemaQuery = `CREATE SCHEMA IF NOT EXISTS ${this.config.SnowflakeDatabase.value}.${quotedSchema}`;
      await this.executeQuery(createSchemaQuery);

      this.config.logMessage(`Database and schema ensured: ${this.config.SnowflakeDatabase.value}.${quotedSchema}`);

    }
  //----------------------------------------------------------------

  //---- createTableIfItDoesntExist ----------------------------------
    async createTableIfItDoesntExist() {

      let columns = [];
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
          const escapedDescription = this.obfuscateSpecialCharacters(this.schema[ columnName ]["description"]);
          columnDescription = ` COMMENT '${escapedDescription}'`;
        }

        columns.push(`"${columnName}" ${columnType}${columnDescription}`);

        existingColumns[ columnName ] = {"name": columnName, "type": columnType};

      }

      // Add PRIMARY KEY (NOT ENFORCED is Snowflake best practice for analytics)
      columns.push(`PRIMARY KEY (${this.uniqueKeyColumns.map(col => `"${col}"`).join(",")}) NOT ENFORCED`);

      let columnsStr = columns.join(",\n  ");

      const quotedSchema = quoteIdentifier(this.config.SnowflakeSchema.value);
      const quotedTable = quoteIdentifier(this.config.DestinationTableName.value);
      let query = `CREATE TABLE IF NOT EXISTS ${this.config.SnowflakeDatabase.value}.${quotedSchema}.${quotedTable} (\n  ${columnsStr}\n)`;

      if( this.description ) {
        const escapedTableDescription = this.obfuscateSpecialCharacters(this.description);
        query += `\nCOMMENT = '${escapedTableDescription}'`;
      }

      await this.executeQuery(query);
      this.config.logMessage(`Table ${this.config.SnowflakeDatabase.value}.${quotedSchema}.${quotedTable} was created`);

      return existingColumns;

    }
  //----------------------------------------------------------------

  //---- addNewColumns -----------------------------------------------
    /**
     * ALTER table by adding missed columns
     *
     * @param {newColumns} array with a list of new columns
     */
    async addNewColumns(newColumns) {

      let columns = [];

      // for each new column requested to be added to the table
      for(var i in newColumns) {

        let columnName = newColumns[i];

        // checking the field exists in schema
        if( columnName in this.schema ) {

          let columnDescription = '';

          let columnType = this.getColumnType(columnName);

          if( "description" in this.schema[ columnName ] ) {
            const escapedDescription = this.obfuscateSpecialCharacters(this.schema[ columnName ]["description"]);
            columnDescription = ` COMMENT '${escapedDescription}'`;
          }

          columns.push(`ADD COLUMN IF NOT EXISTS "${columnName}" ${columnType}${columnDescription}`);
          this.existingColumns[ columnName ] = {"name": columnName, "type": columnType};

        }

      }

      // there are columns to add to table
      if( columns.length > 0 ) {
        const quotedSchema = quoteIdentifier(this.config.SnowflakeSchema.value);
        const quotedTable = quoteIdentifier(this.config.DestinationTableName.value);
        let query = `ALTER TABLE ${this.config.SnowflakeDatabase.value}.${quotedSchema}.${quotedTable}\n`;
        query += columns.join(",\n");
        await this.executeQuery(query);
        this.config.logMessage(`Columns '${newColumns.join(",")}' were added to ${this.config.SnowflakeDatabase.value}.${quotedSchema}.${quotedTable}`);
      }

    }
  //----------------------------------------------------------------

  //---- saveData ----------------------------------------------------
    /**
     * Saving data to storage
     * @param {data} array of assoc objects with records to save
     */
    async saveData(data) {

      for (const row of data) {

        // if there are new columns in the first row they should be added first
        let newFields = Object.keys(row).filter( column => !Object.keys(this.existingColumns).includes(column) );

        if( newFields.length > 0 ) {
          await this.addNewColumns(newFields);
        }

        this.addRecordToBuffer(row);
        await this.saveRecordsAddedToBuffer(this.config.MaxBufferSize.value);

      }

      await this.saveRecordsAddedToBuffer();

    }
  //----------------------------------------------------------------

  //---- addRecordToBuffer -------------------------------------------
    /**
     * Adds record to buffer with deduplication
     * @param {record} object
     */
    addRecordToBuffer(record) {

      let uniqueKey = this.getUniqueKeyByRecordFields( record );
      this.updatedRecordsBuffer[ uniqueKey ] = record;

    }
  //----------------------------------------------------------------

  //---- saveRecordsAddedToBuffer ------------------------------------
    /**
     * Add records from buffer to storage
     * @param (integer) {maxBufferSize} records will be added only if buffer size is larger than this parameter
     */
    async saveRecordsAddedToBuffer(maxBufferSize = 0) {

      let bufferSize = Object.keys( this.updatedRecordsBuffer ).length;

      // buffer must be saved only in case if it is larger than maxBufferSize
      if( bufferSize && bufferSize >= maxBufferSize ) {
        await this.executeQueryWithSizeLimit();
      }

    }
  //----------------------------------------------------------------

  //---- executeQueryWithSizeLimit -----------------------------------
    /**
     * Executes the MERGE query with automatic batching for large datasets
     */
    async executeQueryWithSizeLimit() {
      const bufferKeys = Object.keys(this.updatedRecordsBuffer);
      const totalRecords = bufferKeys.length;

      if (totalRecords === 0) {
        return;
      }

      // Execute with current buffer size
      await this.executeMergeQueryRecursively(bufferKeys, totalRecords);

      // Clear the buffer after processing
      this.updatedRecordsBuffer = {};
    }
  //----------------------------------------------------------------

  //---- executeMergeQueryRecursively --------------------------------
    /**
     * Recursively attempts to execute MERGE queries, reducing batch size if needed
     * @param {Array} recordKeys - Array of record keys to process
     * @param {number} batchSize - Current batch size to attempt
     */
    async executeMergeQueryRecursively(recordKeys, batchSize) {
      // Base case: if no records to process
      if (recordKeys.length === 0) {
        return;
      }

      // If batch size is less than 1, we have a problem
      if (batchSize < 1) {
        throw new Error('Cannot process records: batch size reduced below 1');
      }

      // Take a batch of records
      const currentBatch = recordKeys.slice(0, batchSize);
      const remainingRecords = recordKeys.slice(batchSize);

      // Build query for current batch
      const query = this.buildMergeQuery(currentBatch);

      try {
        // Execute the query
        await this.executeQuery(query);
        this.totalRecordsProcessed += currentBatch.length;

        // Process remaining records if any
        if (remainingRecords.length > 0) {
          await this.executeMergeQueryRecursively(remainingRecords, batchSize);
        }

      } catch (error) {
        // If query fails, try with smaller batch
        if (batchSize > 1) {
          await this.executeMergeQueryRecursively(recordKeys, Math.floor(batchSize / 2));
        } else {
          // Re-throw error if already at minimum batch size
          throw error;
        }
      }
    }
  //----------------------------------------------------------------

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
          let columnValue = null;

          if (record[columnName] === undefined || record[columnName] === null) {

            columnValue = null;

          } else if( columnType.toUpperCase() == "DATE" && (record[ columnName ] instanceof Date) ) {

            columnValue = DateUtils.formatDate( record[ columnName ] );

          } else if( (columnType.toUpperCase().includes("TIMESTAMP") || columnType.toUpperCase() == "DATETIME") && (record[ columnName ] instanceof Date) ) {

            // Format as YYYY-MM-DD HH:MM:SS for Snowflake TIMESTAMP
            const isoString = record[ columnName ].toISOString();
            columnValue = isoString.replace('T', ' ').substring(0, 19);

          } else {

            columnValue = this.obfuscateSpecialCharacters( record[ columnName ] );

          }


          if (columnValue === null) {
            fields.push(`CAST(NULL AS ${columnType}) AS "${columnName}"`);
          } else if (columnType.toUpperCase() == "DATE") {
            fields.push(`TO_DATE('${columnValue}', 'YYYY-MM-DD') AS "${columnName}"`);
          } else if (columnType.toUpperCase().includes("TIMESTAMP") || columnType.toUpperCase() == "DATETIME") {
            fields.push(`TO_TIMESTAMP('${columnValue}', 'YYYY-MM-DD HH24:MI:SS') AS "${columnName}"`);
          } else {
            fields.push(`CAST('${columnValue}' AS ${columnType}) AS "${columnName}"`);
          }

        }

        rows.push(`SELECT ${fields.join(",\n\t")}`);
      }

      let existingColumnsNames = Object.keys(this.existingColumns);

      const quotedSchema = quoteIdentifier(this.config.SnowflakeSchema.value);
      const quotedTable = quoteIdentifier(this.config.DestinationTableName.value);
      let fullTableName = `${this.config.SnowflakeDatabase.value}.${quotedSchema}.${quotedTable}`;

      let query = `MERGE INTO ${fullTableName} AS target
USING (
  ${rows.join("\n  UNION ALL\n  ")}
) AS source

ON ${this.uniqueKeyColumns.map(item => (`target."${item}" = source."${item}"`)).join("\n AND ")}

  WHEN MATCHED THEN
    UPDATE SET
      ${existingColumnsNames.map(item => `target."${item}" = source."${item}"`).join(",\n      ")}
  WHEN NOT MATCHED THEN
    INSERT (
      ${existingColumnsNames.map(item => `"${item}"`).join(", ")}
    )
    VALUES (
      ${existingColumnsNames.map(item => `source."${item}"`).join(", ")}
    )`;

      return query;
    }
  //----------------------------------------------------------------

  //---- executeQuery ------------------------------------------------
    /**
     * Executes Snowflake Query and returns a result
     *
     * @param {query} string
     * @return Promise<Array>
     */
    async executeQuery(query) {

      if (!this.connection) {
        throw new Error("Snowflake connection not initialized");
      }

      return new Promise((resolve, reject) => {
        this.connection.execute({
          sqlText: query,
          complete: (err, stmt, rows) => {
            if (err) {
              reject(new Error(`Snowflake query failed: ${err.message} in query: ${query}`));
            } else {
              resolve(rows || []);
            }
          }
        });
      });
    }
  //----------------------------------------------------------------

  //---- obfuscateSpecialCharacters ----------------------------------
    /**
     * Escape special characters for SQL string literals
     * @param {string} inputString - String to escape
     * @return {string} - Escaped string
     */
    obfuscateSpecialCharacters(inputString) {

      return String(inputString)
        .replace(/\\/g, '\\\\')          // Escape backslashes
        .replace(/\r\n/g, ' ')           // Replace Windows line breaks with space
        .replace(/\n/g, ' ')             // Replace Unix line breaks with space
        .replace(/\r/g, ' ')             // Replace Mac line breaks with space
        .replace(/'/g, "''")             // Escape single quotes (Snowflake style)
        .replace(/"/g, '\\"')            // Escape double quotes
        .replace(/[\x00-\x1F]/g, ' ');   // Replace control chars with space

    }
  //----------------------------------------------------------------

  //---- getColumnType -----------------------------------------------
    /**
     * Get column type for Snowflake from schema
     * @param {string} columnName - Name of the column
     * @returns {string} Snowflake column type
     */
    getColumnType(columnName) {
      return this.schema[columnName]["SnowflakeFieldType"] || this._convertTypeToStorageType(this.schema[columnName]["type"]?.toLowerCase());
    }
  //----------------------------------------------------------------

  //---- _convertTypeToStorageType -----------------------------------
    /**
     * Converts generic type to Snowflake-specific type
     * @param {string} genericType - Generic type from schema
     * @returns {string} Snowflake column type
     */
    _convertTypeToStorageType(genericType) {
      if (!genericType) return 'VARCHAR';

      switch (genericType.toLowerCase()) {
        // Integer types
        case 'integer':
        case 'int32':
        case 'int64':
        case 'long':
          return 'INTEGER';

        // Float types
        case 'float':
        case 'number':
        case 'double':
          return 'FLOAT';
        case 'decimal':
          return 'NUMERIC';

        // Boolean types
        case 'bool':
        case 'boolean':
          return 'BOOLEAN';

        // Date/time types
        case 'date':
          return 'DATE';
        case 'datetime':
          return 'TIMESTAMP_NTZ';  // Timezone-naive
        case 'timestamp':
          return 'TIMESTAMP_TZ';   // Timezone-aware

        // JSON/Object types
        case 'json':
        case 'object':
        case 'array':
          return 'VARCHAR';

        // String types
        case 'numeric string':
        case 'list':
          return 'VARCHAR';

        // Default to VARCHAR for unknown types
        default:
          return 'VARCHAR';
      }
    }
  //----------------------------------------------------------------

}
