/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Helper function to quote identifier with backticks if not already quoted
 * @param {string} identifier - The identifier to quote
 * @returns {string} - Quoted identifier
 */
function quoteIdentifier(identifier) {
  if (!identifier) return identifier;
  // If already quoted with backticks, return as-is
  if (identifier.startsWith('`') && identifier.endsWith('`')) {
    return identifier;
  }
  // Otherwise, add backticks
  return `\`${identifier}\``;
}

var DatabricksStorage = class DatabricksStorage extends AbstractStorage {
  //---- constructor -------------------------------------------------
    /**
     * Databricks storage operations class
     *
     * @param config (object) instance of AbstractConfig
     * @param uniqueKeyColumns (mixed) a name of column with unique key or array with columns names
     * @param schema (object) object with structure like {fieldName: {type: "number", description: "smth" } }
     * @param description (string) string with storage description }
     */
    constructor(config, uniqueKeyColumns, schema = null, description = null) {

      super(
        config.mergeParameters({
          DatabricksHost: {
            isRequired: true,
            requiredType: "string"
          },
          DatabricksHttpPath: {
            isRequired: true,
            requiredType: "string"
          },
          DatabricksToken: {
            isRequired: true,
            requiredType: "string"
          },
          DatabricksCatalog: {
            isRequired: true,
            requiredType: "string"
          },
          DatabricksSchema: {
            isRequired: true,
            requiredType: "string"
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
      this.client = null;
      this.session = null;

    }

  //---- init --------------------------------------------------------
    /**
     * Initializing storage - establishes connection and creates table if needed
     */
    async init() {

      this.checkIfDatabricksIsConnected();
      await this.createConnection();
      await this.testConnection();
      await this.loadTableSchema();

    }
  //----------------------------------------------------------------

  //---- checkIfDatabricksIsConnected ---------------------------------
    checkIfDatabricksIsConnected() {

      if( typeof databricks == "undefined") {
        throw new Error(`Databricks SQL SDK is not available. Ensure @databricks/sql is installed.`);
      }

    }
  //----------------------------------------------------------------

  //---- createConnection --------------------------------------------
    /**
     * Creates and connects to Databricks SQL warehouse
     */
    async createConnection() {
      const { DBSQLClient } = databricks;

      this.client = new DBSQLClient();

      try {
        // Connect to Databricks SQL warehouse
        await this.client.connect({
          host: this.config.DatabricksHost.value,
          path: this.config.DatabricksHttpPath.value,
          token: this.config.DatabricksToken.value
        });

        // Open session with catalog and schema
        this.session = await this.client.openSession({
          initialCatalog: this.config.DatabricksCatalog.value,
          initialSchema: this.config.DatabricksSchema.value
        });

        this.config.logMessage(`Successfully connected to Databricks: ${this.config.DatabricksHost.value}`);
      } catch (error) {
        throw new Error(`Failed to connect to Databricks: ${error.message}`);
      }
    }
  //----------------------------------------------------------------

  //---- testConnection ----------------------------------------------
    /**
     * Tests the connection by executing a simple query
     */
    async testConnection() {
      try {
        await this.executeQuery('SELECT 1');
        this.config.logMessage('Connection test successful');
      } catch (error) {
        throw new Error(`Connection test failed: ${error.message}`);
      }
    }
  //----------------------------------------------------------------

  //---- loadTableSchema ---------------------------------------------
    /**
     * Loads the existing table schema or creates a new one
     */
    async loadTableSchema() {

      this.existingColumns = await this.getAListOfExistingColumns();

      if (Object.keys(this.existingColumns).length == 0) {
        // Table doesn't exist, create it
        await this.createCatalogAndSchemaIfNotExist();
        await this.createTableIfItDoesntExist();
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

      const fullTableName = `${quoteIdentifier(this.config.DatabricksCatalog.value)}.${quoteIdentifier(this.config.DatabricksSchema.value)}.${quoteIdentifier(this.config.DestinationTableName.value)}`;

      let query = `DESCRIBE TABLE ${fullTableName}`;

      let queryResults = [];

      try {
        queryResults = await this.executeQuery(query);
      } catch (error) {
        // If table doesn't exist, return empty columns
        if (error.message && (error.message.includes('does not exist') || error.message.includes('TABLE_OR_VIEW_NOT_FOUND'))) {
          return {};
        }
        throw error;
      }

      let columns = {};

      if (Array.isArray(queryResults)) {
        queryResults.forEach(row => {
          const columnName = row.col_name;
          const dataType = row.data_type;
          // Skip partition columns and metadata rows
          if (columnName && !columnName.startsWith('#') && dataType) {
            columns[columnName] = {"name": columnName, "type": dataType};
          }
        });
      }

      return columns;

    }
  //----------------------------------------------------------------

  //---- createCatalogAndSchemaIfNotExist ---------------------------
    async createCatalogAndSchemaIfNotExist() {

      // Create catalog if not exists (Unity Catalog)
      const quotedCatalog = quoteIdentifier(this.config.DatabricksCatalog.value);
      let createCatalogQuery = `CREATE CATALOG IF NOT EXISTS ${quotedCatalog}`;

      try {
        await this.executeQuery(createCatalogQuery);
      } catch (error) {
        // Catalog creation might fail if Unity Catalog is not enabled or insufficient permissions
        this.config.logMessage(`Note: Could not create catalog (may already exist or insufficient permissions): ${error.message}`);
      }

      // Create schema if not exists
      const quotedSchema = quoteIdentifier(this.config.DatabricksSchema.value);
      let createSchemaQuery = `CREATE SCHEMA IF NOT EXISTS ${quotedCatalog}.${quotedSchema}`;
      await this.executeQuery(createSchemaQuery);

      this.config.logMessage(`Catalog and schema ensured: ${quotedCatalog}.${quotedSchema}`);

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

        columns.push(`${quoteIdentifier(columnName)} ${columnType}${columnDescription}`);

        existingColumns[ columnName ] = {"name": columnName, "type": columnType};

      }

      const fullTableName = `${quoteIdentifier(this.config.DatabricksCatalog.value)}.${quoteIdentifier(this.config.DatabricksSchema.value)}.${quoteIdentifier(this.config.DestinationTableName.value)}`;

      let createTableQuery = `CREATE TABLE IF NOT EXISTS ${fullTableName} (${columns.join(', ')})`;

      await this.executeQuery(createTableQuery);

      this.existingColumns = existingColumns;

      this.config.logMessage(`Table created: ${fullTableName}`);

    }
  //----------------------------------------------------------------

  //---- addNewColumns -----------------------------------------------
    async addNewColumns(columns) {

      const fullTableName = `${quoteIdentifier(this.config.DatabricksCatalog.value)}.${quoteIdentifier(this.config.DatabricksSchema.value)}.${quoteIdentifier(this.config.DestinationTableName.value)}`;

      for (let i in columns) {
        let columnName = columns[i];
        let columnType = this.getColumnType(columnName);

        let alterQuery = `ALTER TABLE ${fullTableName} ADD COLUMN ${quoteIdentifier(columnName)} ${columnType}`;
        await this.executeQuery(alterQuery);

        this.existingColumns[ columnName ] = {"name": columnName, "type": columnType};
      }

      this.config.logMessage(`Added ${columns.length} new column(s) to ${fullTableName}`);

    }
  //----------------------------------------------------------------

  //---- saveData ----------------------------------------------------
    /**
     * Save data to Databricks table
     *
     * @param dataRows (array) array of data rows
     */
    async saveData(dataRows) {

      if( !Array.isArray(dataRows) || dataRows.length === 0 ) {
        return;
      }

      // Group rows by unique key for MERGE operation
      for (let i in dataRows) {
        let row = dataRows[i];
        let uniqueKey = this.getRecordUniqueKey(row);

        if( !this.updatedRecordsBuffer.hasOwnProperty(uniqueKey) ) {
          this.updatedRecordsBuffer[uniqueKey] = row;
        } else {
          // Merge with existing record
          this.updatedRecordsBuffer[uniqueKey] = Object.assign(this.updatedRecordsBuffer[uniqueKey], row);
        }
      }

      // If buffer size exceeds max, flush to database
      if( Object.keys(this.updatedRecordsBuffer).length >= this.config.MaxBufferSize.value ) {
        await this.flushBuffer();
      }

    }
  //----------------------------------------------------------------

  //---- flushBuffer -------------------------------------------------
    async flushBuffer() {

      if( Object.keys(this.updatedRecordsBuffer).length === 0 ) {
        return;
      }

      const fullTableName = `${quoteIdentifier(this.config.DatabricksCatalog.value)}.${quoteIdentifier(this.config.DatabricksSchema.value)}.${quoteIdentifier(this.config.DestinationTableName.value)}`;

      // Prepare data for MERGE
      let records = Object.values(this.updatedRecordsBuffer);

      // Create temporary view with data
      let tempViewName = `temp_merge_${Date.now()}`;
      await this.createTempViewFromRecords(tempViewName, records);

      // Build MERGE query
      let mergeQuery = this.buildMergeQuery(fullTableName, tempViewName);

      try {
        await this.executeQuery(mergeQuery);

        this.totalRecordsProcessed += records.length;
        this.config.logMessage(`Merged ${records.length} records. Total processed: ${this.totalRecordsProcessed}`);

        // Clear buffer
        this.updatedRecordsBuffer = {};
      } finally {
        // Drop temporary view
        await this.executeQuery(`DROP VIEW IF EXISTS ${tempViewName}`);
      }

    }
  //----------------------------------------------------------------

  //---- createTempViewFromRecords -----------------------------------
    async createTempViewFromRecords(viewName, records) {

      if (records.length === 0) return;

      let selectedFields = this.getSelectedFields();
      let fields = selectedFields.length > 0 ? selectedFields : Object.keys(records[0]);

      // Build SELECT statements for UNION ALL
      let selectStatements = records.map(record => {
        let values = fields.map(field => {
          let value = record[field];

          if (value === null || value === undefined) {
            return 'NULL';
          }

          if (typeof value === 'string') {
            // Escape single quotes
            value = value.replace(/'/g, "''");
            return `'${value}'`;
          }

          if (typeof value === 'boolean') {
            return value ? 'TRUE' : 'FALSE';
          }

          return value;
        });

        let aliases = fields.map((field, idx) => `${values[idx]} AS ${quoteIdentifier(field)}`);
        return `SELECT ${aliases.join(', ')}`;
      });

      let createViewQuery = `CREATE OR REPLACE TEMP VIEW ${viewName} AS ${selectStatements.join(' UNION ALL ')}`;

      await this.executeQuery(createViewQuery);

    }
  //----------------------------------------------------------------

  //---- buildMergeQuery ---------------------------------------------
    buildMergeQuery(targetTable, sourceView) {

      let selectedFields = this.getSelectedFields();
      let updateFields = selectedFields.length > 0 ? selectedFields : Object.keys(this.existingColumns);

      // Build ON condition using unique key columns
      let uniqueKeys = Array.isArray(this.uniqueKeyColumns) ? this.uniqueKeyColumns : [this.uniqueKeyColumns];
      let onConditions = uniqueKeys.map(key =>
        `target.${quoteIdentifier(key)} = source.${quoteIdentifier(key)}`
      ).join(' AND ');

      // Build UPDATE SET clause
      let updateSet = updateFields.map(field =>
        `target.${quoteIdentifier(field)} = source.${quoteIdentifier(field)}`
      ).join(', ');

      // Build INSERT columns and values
      let insertColumns = updateFields.map(field => quoteIdentifier(field)).join(', ');
      let insertValues = updateFields.map(field => `source.${quoteIdentifier(field)}`).join(', ');

      return `
        MERGE INTO ${targetTable} AS target
        USING ${sourceView} AS source
        ON ${onConditions}
        WHEN MATCHED THEN
          UPDATE SET ${updateSet}
        WHEN NOT MATCHED THEN
          INSERT (${insertColumns})
          VALUES (${insertValues})
      `;

    }
  //----------------------------------------------------------------

  //---- executeQuery ------------------------------------------------
    /**
     * Executes a query on Databricks
     *
     * @param query (string) SQL query
     * @return results (array) query results
     */
    async executeQuery(query) {

      if (!this.session) {
        throw new Error('Databricks session not initialized');
      }

      try {
        const operation = await this.session.executeStatement(query);
        const result = await operation.fetchAll();
        await operation.close();

        return result;
      } catch (error) {
        throw new Error(`Query execution failed: ${error.message}\nQuery: ${query}`);
      }

    }
  //----------------------------------------------------------------

  //---- getColumnType -----------------------------------------------
    /**
     * Maps schema type to Databricks SQL type
     *
     * @param fieldName (string) field name
     * @return columnType (string) Databricks column type
     */
    getColumnType(fieldName) {

      if( !(fieldName in this.schema) ) {
        return "STRING";
      }

      let type = this.schema[fieldName].type;

      switch (type) {
        case "string":
          return "STRING";
        case "number":
          return "DOUBLE";
        case "integer":
          return "BIGINT";
        case "boolean":
          return "BOOLEAN";
        case "date":
          return "DATE";
        case "datetime":
        case "timestamp":
          return "TIMESTAMP";
        case "array":
          return "ARRAY<STRING>";
        case "object":
          return "STRUCT<>";
        default:
          return "STRING";
      }

    }
  //----------------------------------------------------------------

  //---- close -------------------------------------------------------
    /**
     * Closes Databricks connection
     */
    async close() {

      // Flush any remaining data
      await this.flushBuffer();

      if (this.session) {
        try {
          await this.session.close();
        } catch (error) {
          this.config.logMessage(`Error closing session: ${error.message}`);
        }
      }

      if (this.client) {
        try {
          await this.client.close();
        } catch (error) {
          this.config.logMessage(`Error closing client: ${error.message}`);
        }
      }

      this.config.logMessage(`Databricks connection closed. Total records processed: ${this.totalRecordsProcessed}`);

    }
  //----------------------------------------------------------------

};
