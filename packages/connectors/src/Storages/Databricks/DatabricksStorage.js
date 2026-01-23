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

      this.config.logMessage('Loading table schema...');
      this.existingColumns = await this.getAListOfExistingColumns();

      if (Object.keys(this.existingColumns).length == 0) {
        // Table doesn't exist, create it
        this.config.logMessage('Table does not exist, creating...');
        await this.createCatalogAndSchemaIfNotExist();
        await this.createTableIfItDoesntExist();
      } else {
        // Check if there are new columns from Fields config
        this.config.logMessage(`Table exists with ${Object.keys(this.existingColumns).length} columns`);
        let selectedFields = this.getSelectedFields();
        let newFields = selectedFields.filter( column => !Object.keys(this.existingColumns).includes(column) );
        if( newFields.length > 0 ) {
          this.config.logMessage(`Adding ${newFields.length} new columns`);
          await this.addNewColumns(newFields);
        }
      }

      this.config.logMessage('Table schema loaded successfully');

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
        if (error.message && (error.message.includes('does not exist') || error.message.includes('TABLE_OR_VIEW_NOT_FOUND') || error.message.includes('SCHEMA_NOT_FOUND') || error.message.includes('CATALOG_NOT_FOUND'))) {
          this.config.logMessage(`Table does not exist yet: ${fullTableName}`);
          return {};
        }
        this.config.logMessage(`Error checking table: ${error.message}`);
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

      // Check if uniqueKeyColumns is defined
      const pkColumns = Array.isArray(this.uniqueKeyColumns) ? this.uniqueKeyColumns : [];

      for (let i in tableColumns) {
        let columnName = tableColumns[i];
        let columnDescription = '';

        if( !(columnName in this.schema) ) {
          throw new Error(`Required field ${columnName} not found in schema`);
        }

        let columnType = this.getColumnType(columnName);

        // Add NOT NULL for PRIMARY KEY columns
        const isPartOfPK = pkColumns.includes(columnName);
        const nullability = isPartOfPK ? ' NOT NULL' : '';

        if( "description" in this.schema[ columnName ] ) {
          const escapedDescription = this.obfuscateSpecialCharacters(this.schema[ columnName ]["description"]);
          columnDescription = ` COMMENT '${escapedDescription}'`;
        }

        columns.push(`${quoteIdentifier(columnName)} ${columnType}${nullability}${columnDescription}`);

        existingColumns[ columnName ] = {"name": columnName, "type": columnType};

      }

      const fullTableName = `${quoteIdentifier(this.config.DatabricksCatalog.value)}.${quoteIdentifier(this.config.DatabricksSchema.value)}.${quoteIdentifier(this.config.DestinationTableName.value)}`;

      let createTableQuery = `CREATE TABLE IF NOT EXISTS ${fullTableName} (${columns.join(', ')})`;

      await this.executeQuery(createTableQuery);

      this.existingColumns = existingColumns;

      this.config.logMessage(`Table created: ${fullTableName}`);

      // Add PRIMARY KEY constraint if uniqueKeyColumns are defined
      await this.addPrimaryKeyConstraint(fullTableName);

    }
  //----------------------------------------------------------------

  //---- addPrimaryKeyConstraint -------------------------------------
    /**
     * Adds PRIMARY KEY constraint to the table using uniqueKeyColumns
     * In Databricks, PRIMARY KEY is informational (not enforced) but useful for schema documentation
     */
    async addPrimaryKeyConstraint(fullTableName) {
      if (!this.uniqueKeyColumns || this.uniqueKeyColumns.length === 0) {
        this.config.logMessage('No unique key columns defined, skipping PRIMARY KEY constraint');
        return;
      }

      try {
        const pkColumns = this.uniqueKeyColumns.map(col => quoteIdentifier(col)).join(', ');
        const constraintName = `pk_${this.config.DestinationTableName.value}`;

        const addConstraintQuery = `ALTER TABLE ${fullTableName} ADD CONSTRAINT ${quoteIdentifier(constraintName)} PRIMARY KEY (${pkColumns})`;

        await this.executeQuery(addConstraintQuery);

        this.config.logMessage(`Added PRIMARY KEY constraint on columns: ${this.uniqueKeyColumns.join(', ')}`);
      } catch (error) {
        // PRIMARY KEY constraint might already exist or not be supported
        this.config.logMessage(`Note: Could not add PRIMARY KEY constraint: ${error.message}`);
      }
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

      // Check if there are new columns in the first row
      if (dataRows.length > 0) {
        let newFields = Object.keys(dataRows[0]).filter(column => !Object.keys(this.existingColumns).includes(column));
        if (newFields.length > 0) {
          await this.addNewColumns(newFields);
        }
      }

      // Group rows by unique key for MERGE operation
      for (let i in dataRows) {
        let row = dataRows[i];
        let uniqueKey = this.getUniqueKeyByRecordFields(row);

        if( !this.updatedRecordsBuffer.hasOwnProperty(uniqueKey) ) {
          this.updatedRecordsBuffer[uniqueKey] = row;
        } else {
          // Merge with existing record
          this.updatedRecordsBuffer[uniqueKey] = Object.assign(this.updatedRecordsBuffer[uniqueKey], row);
        }
      }

      // Always flush buffer after saveData to ensure all data is persisted
      // This is important because connectors might not call close() explicitly
      await this.flushBuffer();

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

      // Build inline SELECT statements for records
      let selectStatements = this.buildSelectStatementsForRecords(records);

      // Build MERGE query with inline source
      let mergeQuery = this.buildMergeQueryWithInlineSource(fullTableName, selectStatements);

      await this.executeQuery(mergeQuery);

      this.totalRecordsProcessed += records.length;
      this.config.logMessage(`Merged ${records.length} records. Total processed: ${this.totalRecordsProcessed}`);

      // Clear buffer
      this.updatedRecordsBuffer = {};

    }
  //----------------------------------------------------------------

  //---- buildSelectStatementsForRecords ----------------------------
    buildSelectStatementsForRecords(records) {

      if (records.length === 0) return [];

      let selectedFields = this.getSelectedFields();
      let fields = selectedFields.length > 0 ? selectedFields : Object.keys(records[0]);

      // Build SELECT statements for UNION ALL
      let selectStatements = records.map(record => {
        let values = fields.map(field => {
          let value = record[field];

          // Handle null, undefined, NaN, Infinity
          if (value === null || value === undefined) {
            return 'NULL';
          }

          if (typeof value === 'number') {
            if (isNaN(value) || !isFinite(value)) {
              return 'NULL';
            }
            return value;
          }

          if (typeof value === 'string') {
            // Escape single quotes
            value = value.replace(/'/g, "''");
            return `'${value}'`;
          }

          if (typeof value === 'boolean') {
            return value ? 'TRUE' : 'FALSE';
          }

          // Handle Date objects
          if (value instanceof Date) {
            const isoString = value.toISOString().replace('T', ' ').replace('Z', '');
            return `TIMESTAMP '${isoString}'`;
          }

          // Handle arrays and objects - serialize to JSON
          if (typeof value === 'object') {
            const jsonString = JSON.stringify(value).replace(/'/g, "''");
            return `'${jsonString}'`;
          }

          return value;
        });

        // Cast values to proper types and add aliases
        let aliases = fields.map((field, idx) => {
          // Get column type from existing columns
          let columnType = 'STRING';
          if (this.existingColumns && this.existingColumns[field]) {
            columnType = this.existingColumns[field].type;
          }

          let value = values[idx];

          // Cast to correct type (including NULL)
          return `CAST(${value} AS ${columnType}) AS ${quoteIdentifier(field)}`;
        });

        return `SELECT ${aliases.join(', ')}`;
      });

      return selectStatements;

    }
  //----------------------------------------------------------------

  //---- buildMergeQueryWithInlineSource ----------------------------
    buildMergeQueryWithInlineSource(targetTable, selectStatements) {

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

      // Build MERGE query with inline subquery
      return `MERGE INTO ${targetTable} AS target
USING (
  ${selectStatements.join('\n  UNION ALL\n  ')}
) AS source
ON ${onConditions}
WHEN MATCHED THEN
  UPDATE SET ${updateSet}
WHEN NOT MATCHED THEN
  INSERT (${insertColumns}) VALUES (${insertValues})`;

    }
  //----------------------------------------------------------------

  //---- createTempViewFromRecords [DEPRECATED] ---------------------
    // This method is no longer used - kept for reference
    async createTempViewFromRecords(viewName, records) {

      if (records.length === 0) return;

      let selectStatements = this.buildSelectStatementsForRecords(records);

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
        this.config.logMessage(`WARNING: Field '${fieldName}' not found in schema, defaulting to STRING. Available fields: ${Object.keys(this.schema).join(', ')}`);
        return "STRING";
      }

      let type = this.schema[fieldName].type;

      switch (type) {
        case DATA_TYPES.STRING:
          return "STRING";
        case DATA_TYPES.NUMBER:
          return "DOUBLE";
        case DATA_TYPES.INTEGER:
          return "BIGINT";
        case DATA_TYPES.BOOLEAN:
          return "BOOLEAN";
        case DATA_TYPES.DATE:
          return "DATE";
        case DATA_TYPES.DATETIME:
        case DATA_TYPES.TIMESTAMP:
          return "TIMESTAMP";
        case DATA_TYPES.TIME:
          return "TIME";
        case DATA_TYPES.ARRAY:
        case DATA_TYPES.OBJECT:
          // Arrays and Objects are stored as JSON strings in Databricks
          return "STRING";
        default:
          return "STRING";
      }

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
        .replace(/'/g, "''")             // Escape single quotes (SQL standard)
        .replace(/"/g, '\\"')            // Escape double quotes
        .replace(/[\x00-\x1F]/g, ' ');   // Replace control chars with space

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
