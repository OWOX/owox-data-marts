/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

function stripQuotes(value) {
  return value ? value.replace(/^"|"$/g, '') : value;
}

function quoteIdentifier(value) {
  return `"${stripQuotes(value).replace(/"/g, '""')}"`;
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function createSnapshotTableNames(tableName) {
  const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const stagingSuffix = `__owox_stage_${token}`;
  const backupSuffix = `__owox_backup_${token}`;
  const baseLength = Math.max(1, 127 - Math.max(stagingSuffix.length, backupSuffix.length));
  const baseName = stripQuotes(tableName).slice(0, baseLength);

  return {
    stagingTableName: `${baseName}${stagingSuffix}`,
    backupTableName: `${baseName}${backupSuffix}`
  };
}

const REDSHIFT_SNAPSHOT_MAX_QUERY_BYTES = 90 * 1024;

function utf8ByteLength(value) {
  let bytes = 0;

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }

  return bytes;
}

function splitSnapshotRowsByQuerySize(rows, maxRows, maxBytes, buildSingleRowQuery) {
  const batches = [];
  let batch = [];
  let batchBytes = 0;

  for (const row of rows) {
    const rowBytes = utf8ByteLength(buildSingleRowQuery(row));
    if (rowBytes > maxBytes) {
      throw new Error(
        `A single Google Sheets row exceeds the Redshift statement size limit (${maxBytes} bytes)`
      );
    }

    if (batch.length && (batch.length >= maxRows || batchBytes + rowBytes > maxBytes)) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }

    batch.push(row);
    batchBytes += rowBytes;
  }

  if (batch.length) {
    batches.push(batch);
  }

  return batches;
}

var AwsRedshiftStorage = class AwsRedshiftStorage extends AbstractStorage {
  //---- constructor -------------------------------------------------
  /**
   * Class for managing data in AWS Redshift using Data API
   *
   * @param config (object) instance of AbstractConfig
   * @param uniqueKeyColumns (mixed) a name of column with unique key or array with columns names
   * @param schema (object) object with structure like {fieldName: {type: "string", description: "smth" } }
   * @param description (string) string with storage description
   */
  constructor(config, uniqueKeyColumns, schema = null, description = null) {
    super(
      config.mergeParameters({
        AWSRegion: {
          isRequired: true,
          requiredType: "string"
        },
        AWSAccessKeyId: {
          isRequired: true,
          requiredType: "string"
        },
        AWSSecretAccessKey: {
          isRequired: true,
          requiredType: "string"
        },
        Database: {
          isRequired: true,
          requiredType: "string"
        },
        WorkgroupName: {
          isRequired: false,
          requiredType: "string"
        },
        ClusterIdentifier: {
          isRequired: false,
          requiredType: "string"
        },
        Schema: {
          isRequired: true,
          requiredType: "string"
        },
        DestinationTableName: {
          isRequired: true,
          requiredType: "string"
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

    this.initAWS();

    this.updatedRecordsBuffer = {};
    this.existingColumns = {};
  }

  //---- init --------------------------------------------------------
  /**
   * Initializing storage
   */
  async init() {
    await this.checkConnection();
    this.config.logMessage('Connection to Redshift established');
    await this.loadTableSchema();
  }
  //----------------------------------------------------------------

  //---- loadTableSchema --------------------------------------------
  async loadTableSchema() {
    this.existingColumns = await this.getAListOfExistingColumns();

    // Only add new columns here — createTable() is intentionally deferred to
    // saveData() so it only fires when data is actually written, preserving
    // the CreateEmptyTables semantics enforced at the connector level.
    if (Object.keys(this.existingColumns).length > 0) {
      const selectedFields = this.getSelectedFields();
      const newFields = selectedFields.filter(col => !(col in this.existingColumns));
      if (newFields.length > 0) {
        await this.addNewColumns(newFields);
      }
    }
  }
  //----------------------------------------------------------------

  //---- getAListOfExistingColumns ----------------------------------
  async getAListOfExistingColumns() {
    // Strip surrounding double-quotes that may be present in config values.
    // Prefer exact matching first because quoted Redshift identifiers can be
    // case-sensitive; fall back to LOWER() for clusters that fold identifiers.
    const rawSchema = stripQuotes(this.config.Schema.value);
    const rawTable = stripQuotes(this.config.DestinationTableName.value);

    const exactSql = `SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = '${rawSchema}'
        AND table_name = '${rawTable}'
      ORDER BY ordinal_position`;

    const fallbackSql = `SELECT column_name, data_type
      FROM information_schema.columns
      WHERE LOWER(table_schema) = LOWER('${rawSchema}')
        AND LOWER(table_name) = LOWER('${rawTable}')
      ORDER BY ordinal_position`;

    let rows;
    try {
      rows = await this.executeQueryWithResults(exactSql);
      if (rows.length === 0) {
        rows = await this.executeQueryWithResults(fallbackSql);
      }
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        return {};
      }
      throw error;
    }

    // Redshift folds even quoted identifiers to lowercase by default, so a column
    // created as "CampaignId" comes back as campaignid. Map info_schema names back
    // to the configured schema key (case-insensitively) whenever the returned name
    // doesn't already match a key exactly, so existingColumns keys line up with
    // getSelectedFields() and loadTableSchema() doesn't re-add existing columns.
    // An exact name always wins (handles case-sensitive clusters untouched).
    const schemaKeyByLower = {};
    for (const key of Object.keys(this.schema || {})) {
      schemaKeyByLower[key.toLowerCase()] = key;
    }

    const columns = {};
    for (const row of rows) {
      const columnName = row.column_name;
      const schemaKey = (this.schema && columnName in this.schema)
        ? columnName
        : (schemaKeyByLower[columnName.toLowerCase()] || columnName);
      columns[schemaKey] = (this.schema && schemaKey in this.schema)
        ? this.getColumnType(schemaKey)
        : row.data_type;
    }
    return columns;
  }
  //----------------------------------------------------------------

  //---- executeQueryWithResults ------------------------------------
  async executeQueryWithResults(sql) {
    const params = {
      Sql: sql,
      Database: this.config.Database.value
    };
    if (this.config.WorkgroupName.value) {
      params.WorkgroupName = this.config.WorkgroupName.value;
    } else if (this.config.ClusterIdentifier.value) {
      params.ClusterIdentifier = this.config.ClusterIdentifier.value;
    }

    const command = new ExecuteStatementCommand(params);
    const response = await this.redshiftDataClient.send(command);
    await this.waitForQueryCompletion(response.Id);

    const rows = [];
    let nextToken;
    do {
      const resultParams = { Id: response.Id };
      if (nextToken) resultParams.NextToken = nextToken;
      const result = await this.redshiftDataClient.send(new GetStatementResultCommand(resultParams));
      const columnNames = (result.ColumnMetadata || []).map(col => col.name);
      for (const record of (result.Records || [])) {
        const row = {};
        columnNames.forEach((colName, i) => {
          const field = record[i];
          if (field.isNull) row[colName] = null;
          else if ('stringValue' in field) row[colName] = field.stringValue;
          else if ('longValue' in field) row[colName] = Number(field.longValue);
          else if ('doubleValue' in field) row[colName] = field.doubleValue;
          else if ('booleanValue' in field) row[colName] = field.booleanValue;
          else row[colName] = null;
        });
        rows.push(row);
      }
      nextToken = result.NextToken;
    } while (nextToken);

    return rows;
  }
  //----------------------------------------------------------------

  //---- initAWS ----------------------------------------------------
  /**
   * Initialize AWS SDK clients
   */
  initAWS() {
    try {
      // Configure AWS credentials
      const clientConfig = {
        region: this.config.AWSRegion.value,
        credentials: {
          accessKeyId: this.config.AWSAccessKeyId.value,
          secretAccessKey: this.config.AWSSecretAccessKey.value
        }
      };

      // Initialize Redshift Data client
      this.redshiftDataClient = new RedshiftDataClient(clientConfig);

      this.config.logMessage('AWS SDK initialized successfully');
    } catch (error) {
      throw new Error(`Failed to initialize AWS SDK: ${error.message}`);
    }
  }
  //----------------------------------------------------------------

  //---- checkConnection ---------------------------------------------
  /**
   * Check connection to Redshift
   * @returns {Promise}
   */
  async checkConnection() {
    const params = {
      Sql: 'SELECT 1',
      Database: this.config.Database.value
    };

    if (this.config.WorkgroupName.value) {
      params.WorkgroupName = this.config.WorkgroupName.value;
    } else if (this.config.ClusterIdentifier.value) {
      params.ClusterIdentifier = this.config.ClusterIdentifier.value;
    } else {
      throw new Error('Either WorkgroupName or ClusterIdentifier must be provided');
    }

    try {
      const command = new ExecuteStatementCommand(params);
      const response = await this.redshiftDataClient.send(command);
      await this.waitForQueryCompletion(response.Id);
      return true;
    } catch (error) {
      throw new Error(`Connection check failed: ${error.message}`);
    }
  }
  //----------------------------------------------------------------

  //---- executeQuery -----------------------------------------------
  /**
   * Execute SQL query using Redshift Data API
   * @param {string} sql - SQL query to execute
   * @param {string} type - Query type ('ddl' or 'dml')
   * @returns {Promise}
   */
  async executeQuery(sql, type = 'dml') {
    const params = {
      Sql: sql,
      Database: this.config.Database.value
    };

    if (this.config.WorkgroupName.value) {
      params.WorkgroupName = this.config.WorkgroupName.value;
    } else if (this.config.ClusterIdentifier.value) {
      params.ClusterIdentifier = this.config.ClusterIdentifier.value;
    }

    try {
      const command = new ExecuteStatementCommand(params);
      const response = await this.redshiftDataClient.send(command);

      await this.waitForQueryCompletion(response.Id);

      return response.Id;
    } catch (error) {
      this.config.logMessage(`Query execution failed: ${error.message}`, 'error');
      throw error;
    }
  }
  //----------------------------------------------------------------

  //---- executeTransaction ------------------------------------------
  async executeTransaction(sqlStatements) {
    const params = {
      Sqls: sqlStatements,
      Database: this.config.Database.value,
    };

    if (this.config.WorkgroupName.value) {
      params.WorkgroupName = this.config.WorkgroupName.value;
    } else if (this.config.ClusterIdentifier.value) {
      params.ClusterIdentifier = this.config.ClusterIdentifier.value;
    }

    const response = await this.redshiftDataClient.send(new BatchExecuteStatementCommand(params));
    await this.waitForQueryCompletion(response.Id);
  }
  //----------------------------------------------------------------

  //---- waitForQueryCompletion -------------------------------------
  /**
   * Wait for query execution to complete
   * @param {string} statementId - Statement ID to check
   * @returns {Promise}
   */
  async waitForQueryCompletion(statementId) {
    const maxAttempts = 300; // 5 minutes with 1 second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const describeCommand = new DescribeStatementCommand({ Id: statementId });
      const response = await this.redshiftDataClient.send(describeCommand);

      const status = response.Status;

      if (status === 'FINISHED') {
        return;
      } else if (status === 'FAILED' || status === 'ABORTED') {
        const error = response.Error || 'Unknown error';
        throw new Error(`Query ${status}: ${error}`);
      }

      attempts++;
    }

    throw new Error(`Query timeout after ${maxAttempts} seconds for statement ${statementId}`);
  }
  //----------------------------------------------------------------

  //---- getColumnType ----------------------------------------------
  /**
   * Get Redshift column type for a field
   * @param {string} columnName - Column name
   * @returns {string} - Redshift column type
   */
  getColumnType(columnName) {
    const field = this.schema[columnName];

    if (!field || !field.type) {
      return 'VARCHAR(65535)';
    }

    switch (field.type) {

      case DATA_TYPES.INTEGER:
        return 'BIGINT';

      case DATA_TYPES.NUMBER:
        return 'DOUBLE PRECISION';

      case DATA_TYPES.BOOLEAN:
        return 'BOOLEAN';

      case DATA_TYPES.DATE:
        return 'DATE';
      case DATA_TYPES.DATETIME:
      case DATA_TYPES.TIMESTAMP:
        return 'TIMESTAMP';

      case DATA_TYPES.OBJECT:
        return 'SUPER';

      case DATA_TYPES.STRING:
      case DATA_TYPES.ARRAY:
        return 'VARCHAR(65535)';

      default:
        throw new Error(`Unknown type: ${type}`);
    }
  }
  //----------------------------------------------------------------

  //---- createSchemaIfNotExist -------------------------------------
  /**
   * Create schema in Redshift if it doesn't exist
   * @returns {Promise}
   */
  async createSchemaIfNotExist() {
    const schemaName = stripQuotes(this.config.Schema.value);
    if (!schemaName) {
      throw new Error('Schema name is required but not provided');
    }
    const createSchemaQuery = `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`;

    await this.executeQuery(createSchemaQuery, 'ddl');
    this.config.logMessage(`Schema "${schemaName}" ensured`);
  }
  //----------------------------------------------------------------

  //---- createTable ------------------------------------------------
  /**
   * Create table in Redshift
   * @returns {Promise}
   */
  async createTable() {
    // Ensure schema exists before creating table
    await this.createSchemaIfNotExist();

    const existingColumns = {};
    const columnDefinitions = [];

    // Add unique key columns first
    for (let columnName of this.uniqueKeyColumns) {
      let columnType = this.getColumnType(columnName);
      columnDefinitions.push(`"${columnName}" ${columnType}`);
      existingColumns[columnName] = columnType;
    }

    let selectedFields = this.getSelectedFields();

    // Add all other schema fields
    for (let columnName in this.schema) {
      if (!this.uniqueKeyColumns.includes(columnName) && selectedFields.includes(columnName)) {
        let columnType = this.getColumnType(columnName);
        columnDefinitions.push(`"${columnName}" ${columnType}`);
        existingColumns[columnName] = columnType;
      }
    }

    // Build primary key constraint
    const pkColumns = this.uniqueKeyColumns.map(col => `"${col}"`).join(', ');

    const schemaName = stripQuotes(this.config.Schema.value);
    const tableName = stripQuotes(this.config.DestinationTableName.value);
    const query = `
      CREATE TABLE IF NOT EXISTS "${schemaName}"."${tableName}" (
        ${columnDefinitions.join(',\n        ')},
        PRIMARY KEY (${pkColumns})
      )
    `;

    await this.executeQuery(query, 'ddl');
    this.config.logMessage(`Table "${schemaName}"."${tableName}" created`);
    await this.applyColumnComments(Object.keys(existingColumns));
    this.existingColumns = existingColumns;

    return existingColumns;
  }
  //----------------------------------------------------------------

  //---- replaceData -------------------------------------------------
  /**
   * Replace destination table with the current source snapshot.
   * @param {Array} data - Array of records to save
   * @returns {Promise<void>}
   */
  async replaceData(data) {
    await this.checkConnection();
    await this.createSchemaIfNotExist();

    const schemaName = stripQuotes(this.config.Schema.value);
    const configuredTableName = this.config.DestinationTableName.value;
    const liveTableName = stripQuotes(configuredTableName);
    const { stagingTableName, backupTableName } = createSnapshotTableNames(liveTableName);
    const originalExistingColumns = this.existingColumns;
    const liveColumns = await this.getAListOfExistingColumns();
    const liveTableExists = Object.keys(liveColumns).length > 0;
    const grantStatements = liveTableExists
      ? await this.getTableGrantStatements(liveTableName, stagingTableName)
      : [];
    let published = false;

    try {
      this.config.DestinationTableName.value = stagingTableName;
      this.existingColumns = {};
      const stagedColumns = await this.createTable();

      if (data.length) {
        const batchSize = Math.max(1, Number(this.config.MaxBufferSize?.value) || 250);
        const batches = this.createSnapshotBatches(data, batchSize);
        for (const batch of batches) {
          await this.saveData(batch);
        }
      }

      await this.validateSnapshotRowCount(stagingTableName, data.length);

      for (const grantSql of grantStatements) {
        await this.executeQuery(grantSql, 'ddl');
      }

      this.config.DestinationTableName.value = configuredTableName;

      const publicationStatements = liveTableExists
        ? [
            `ALTER TABLE ${quoteIdentifier(schemaName)}.${quoteIdentifier(liveTableName)} RENAME TO ${quoteIdentifier(backupTableName)}`,
            `ALTER TABLE ${quoteIdentifier(schemaName)}.${quoteIdentifier(stagingTableName)} RENAME TO ${quoteIdentifier(liveTableName)}`,
            `DROP TABLE ${quoteIdentifier(schemaName)}.${quoteIdentifier(backupTableName)}`
          ]
        : [
            `ALTER TABLE ${quoteIdentifier(schemaName)}.${quoteIdentifier(stagingTableName)} RENAME TO ${quoteIdentifier(liveTableName)}`
          ];

      await this.executeTransaction(publicationStatements);
      this.existingColumns = stagedColumns;
      published = true;

      this.config.logMessage(
        `Snapshot import completed for ${quoteIdentifier(schemaName)}.${quoteIdentifier(liveTableName)}: ${data.length} rows`
      );
    } finally {
      this.config.DestinationTableName.value = configuredTableName;
      if (!published) {
        this.existingColumns = originalExistingColumns;
      }

      try {
        await this.executeQuery(
          `DROP TABLE IF EXISTS ${quoteIdentifier(schemaName)}.${quoteIdentifier(stagingTableName)}`,
          'ddl'
        );
      } catch (cleanupError) {
        this.config.logMessage(
          `Warning: Failed to clean up snapshot staging table ${quoteIdentifier(stagingTableName)}: ${cleanupError.message}`
        );
      }
    }
  }
  //----------------------------------------------------------------

  //---- createSnapshotBatches --------------------------------------
  createSnapshotBatches(data, maxRows, maxBytes = REDSHIFT_SNAPSHOT_MAX_QUERY_BYTES) {
    const selectedFields = this.getSelectedFields();
    const dataKeys = Object.keys(data[0] || {});
    const columns = dataKeys.filter(key => selectedFields.includes(key));
    const estimateTableName = `temp_${stripQuotes(this.config.DestinationTableName.value)}_${Date.now()}`;

    return splitSnapshotRowsByQuerySize(
      data,
      Math.max(1, maxRows),
      maxBytes,
      row => this.buildInsertBatchQuery(estimateTableName, columns, [row])
    );
  }
  //----------------------------------------------------------------

  //---- validateSnapshotRowCount ------------------------------------
  async validateSnapshotRowCount(tableName, expectedRowCount) {
    const schemaName = stripQuotes(this.config.Schema.value);
    const rows = await this.executeQueryWithResults(
      `SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`
    );
    const value = rows[0]?.row_count ?? rows[0]?.ROW_COUNT;
    const actualRowCount = Number(value);

    if (!Number.isSafeInteger(actualRowCount) || actualRowCount !== expectedRowCount) {
      const actual = Number.isSafeInteger(actualRowCount) ? actualRowCount : 'unknown';
      throw new Error(
        `Snapshot staging row count mismatch for ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}: expected ${expectedRowCount}, got ${actual}`
      );
    }

    return actualRowCount;
  }
  //----------------------------------------------------------------

  //---- getTableGrantStatements -------------------------------------
  async getTableGrantStatements(sourceTableName, targetTableName) {
    const schemaName = stripQuotes(this.config.Schema.value);
    const rows = await this.executeQueryWithResults(`
      SELECT identity_name, identity_type, privilege_type, admin_option
      FROM svv_relation_privileges
      WHERE namespace_name = '${escapeSqlLiteral(schemaName)}'
        AND relation_name = '${escapeSqlLiteral(sourceTableName)}'
      ORDER BY identity_type, identity_name, privilege_type
    `);
    const targetTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier(targetTableName)}`;

    return rows.map(row => {
      const identityName = row.identity_name ?? row.IDENTITY_NAME;
      const identityType = String(row.identity_type ?? row.IDENTITY_TYPE).toUpperCase();
      const privilege = String(row.privilege_type ?? row.PRIVILEGE_TYPE).toUpperCase();
      const adminOption = row.admin_option ?? row.ADMIN_OPTION;

      if (!/^[A-Z ]+$/.test(privilege)) {
        throw new Error(`Unsupported Redshift table privilege: ${privilege}`);
      }

      let grantee;
      if (identityType === 'PUBLIC') {
        grantee = 'PUBLIC';
      } else if (identityType === 'ROLE') {
        grantee = `ROLE ${quoteIdentifier(identityName)}`;
      } else if (identityType === 'GROUP') {
        grantee = `GROUP ${quoteIdentifier(identityName)}`;
      } else if (identityType === 'USER') {
        grantee = quoteIdentifier(identityName);
      } else {
        throw new Error(`Unsupported Redshift grant identity type: ${identityType}`);
      }

      const withGrantOption = adminOption === true || String(adminOption).toLowerCase() === 'true'
        ? ' WITH GRANT OPTION'
        : '';
      return `GRANT ${privilege} ON TABLE ${targetTable} TO ${grantee}${withGrantOption}`;
    });
  }
  //----------------------------------------------------------------

  //---- addNewColumns ----------------------------------------------
  /**
   * Add new columns to the Redshift table
   * @param {Array} newColumns - Array of column names to add
   * @returns {Promise}
   */
  async addNewColumns(newColumns) {
    const columnsToAdd = [];

    for (let columnName of newColumns) {
      if (columnName in this.schema) {
        let columnType = this.getColumnType(columnName);
        columnsToAdd.push(`"${columnName}" ${columnType}`);
        this.existingColumns[columnName] = columnType;
      }
    }

    if (columnsToAdd.length > 0) {
      const tableRef = `"${stripQuotes(this.config.Schema.value)}"."${stripQuotes(this.config.DestinationTableName.value)}"`;
      for (const columnDef of columnsToAdd) {
        await this.executeQuery(`ALTER TABLE ${tableRef} ADD COLUMN ${columnDef}`, 'ddl');
      }
      this.config.logMessage(`Columns '${newColumns.join(',')}' were added to ${tableRef}`);

      await this.applyColumnComments(newColumns);
      return newColumns;
    }

    return newColumns;
  }
  //----------------------------------------------------------------

  //---- applyColumnComments ----------------------------------------
  /**
   * Apply comments to provided columns if description exists in schema
   * @param {Array<string>} columns - columns to process
   */
  async applyColumnComments(columns) {
    const schemaName = stripQuotes(this.config.Schema.value);
    const tableName = stripQuotes(this.config.DestinationTableName.value);

    for (let columnName of columns) {
      const field = this.schema[columnName];

      if (!field || !field.description) {
        continue;
      }

      const escapedDescription = this.escapeDescription(field.description);
      const query = `COMMENT ON COLUMN "${schemaName}"."${tableName}"."${columnName}" IS '${escapedDescription}'`;

      try {
        await this.executeQuery(query, 'ddl');
      } catch (error) {
        this.config.logMessage(
          `Could not set comment for column "${columnName}" on "${schemaName}"."${tableName}": ${error.message}`
        );
      }
    }
  }
  //----------------------------------------------------------------

  //---- escapeDescription ------------------------------------------
  /**
   * Escape single quotes for safe COMMENT ON usage
   */
  escapeDescription(description) {
    if (!description) {
      return description;
    }

    return String(description).replace(/'/g, "''");
  }
  //----------------------------------------------------------------

  //---- saveData ---------------------------------------------------
  /**
   * Saving data to Redshift using MERGE
   * @param {Array} data - Array of objects with records to save
   * @returns {Promise}
   */
  async saveData(data) {
    if (!data || data.length === 0) {
      // Only create the table for an empty batch when explicitly requested —
      // some connectors pass empty batches without checking CreateEmptyTables first.
      if (Object.keys(this.existingColumns).length === 0 && this.config.CreateEmptyTables?.value) {
        await this.createTable();
      }
      return Promise.resolve();
    }

    // Create table on first write with actual data
    if (Object.keys(this.existingColumns).length === 0) {
      await this.createTable();
    }

    // Check for new columns in incoming data not yet in the table
    const dataKeys = Object.keys(data[0]);
    const newColumns = dataKeys.filter(key => !(key in this.existingColumns));

    if (newColumns.length > 0) {
      await this.addNewColumns(newColumns);
    }

    // Prepare data for MERGE
    const selectedFields = this.getSelectedFields();
    const columnsToInsert = dataKeys.filter(key => selectedFields.includes(key));

    // Build MERGE statement
    const tempTableName = `temp_${stripQuotes(this.config.DestinationTableName.value)}_${Date.now()}`;
    const schemaName = stripQuotes(this.config.Schema.value);

    if (!schemaName) {
      throw new Error('Schema name is required but not provided');
    }

    // Create temp table in the same schema (Redshift Data API doesn't support TEMP tables across statements)
    const tempColumns = columnsToInsert.map(col =>
      `"${col}" ${this.existingColumns[col] || this.getColumnType(col)}`
    ).join(', ');

    await this.executeQuery(`
      CREATE TABLE "${schemaName}"."${tempTableName}" (${tempColumns})
    `, 'ddl');

    try {
      // Insert data into temp table in batches
      const batchSize = this.config.MaxBufferSize.value;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        await this.insertBatch(tempTableName, columnsToInsert, batch);
      }

      // Execute MERGE
      await this.mergeTempTable(tempTableName, columnsToInsert);
    } finally {
      // Always clean up temp table, even if there's an error
      try {
        await this.executeQuery(`DROP TABLE "${schemaName}"."${tempTableName}"`, 'ddl');
        this.config.logMessage(`Temp table "${tempTableName}" cleaned up`);
      } catch (dropError) {
        this.config.logMessage(`Warning: Failed to drop temp table "${tempTableName}": ${dropError.message}`);
      }
    }

    this.config.logMessage(`Successfully saved ${data.length} records`);

    return data.length;
  }
  //----------------------------------------------------------------

  //---- insertBatch ------------------------------------------------
  /**
   * Insert batch of records into temp table
   * @param {string} tableName - Table name
   * @param {Array} columns - Column names
   * @param {Array} records - Records to insert
   * @returns {Promise}
   */
  async insertBatch(tableName, columns, records) {
    await this.executeQuery(this.buildInsertBatchQuery(tableName, columns, records), 'dml');
  }
  //----------------------------------------------------------------

  //---- buildInsertBatchQuery --------------------------------------
  buildInsertBatchQuery(tableName, columns, records) {
    const values = records.map(record => {
      const vals = columns.map(col => {
        const value = record[col];

        if (value === null || value === undefined) {
          return 'NULL';
        }

        if (typeof value === 'boolean') {
          return value ? 'TRUE' : 'FALSE';
        }

        if (typeof value === 'number') {
          // Check for NaN and Infinity
          if (isNaN(value) || !isFinite(value)) {
            return 'NULL';
          }
          return value;
        }

        if (value instanceof Date) {
          const columnType = this.existingColumns[col] || this.getColumnType(col);

          if (columnType === 'DATE') {
            // Format as YYYY-MM-DD for DATE type
            const formattedDate = DateUtils.formatDate(value);
            return `'${formattedDate}'`;
          } else if (columnType === 'TIMESTAMP') {
            // Format as YYYY-MM-DD HH:MM:SS for TIMESTAMP type
            const isoString = value.toISOString();
            const formattedTimestamp = isoString.replace('T', ' ').substring(0, 19);
            return `'${formattedTimestamp}'`;
          }
        }

        // Escape single quotes in strings
        const stringValue = String(value).replace(/'/g, "''");
        return `'${stringValue}'`;
      }).join(', ');

      return `(${vals})`;
    }).join(',\n      ');

    const columnList = columns.map(col => `"${col}"`).join(', ');

    return `
      INSERT INTO "${stripQuotes(this.config.Schema.value)}"."${tableName}" (${columnList})
      VALUES ${values}
    `;
  }
  //----------------------------------------------------------------

  //---- mergeTempTable ---------------------------------------------
  /**
   * Merge temp table data into main table
   * @param {string} tempTableName - Temp table name
   * @param {Array} columns - Column names
   * @returns {Promise}
   */
  async mergeTempTable(tempTableName, columns) {
    const targetTable = `"${stripQuotes(this.config.Schema.value)}"."${stripQuotes(this.config.DestinationTableName.value)}"`;
    const sourceTable = `"${stripQuotes(this.config.Schema.value)}"."${tempTableName}"`;

    // Build ON clause for matching
    const onClause = this.uniqueKeyColumns.map(col =>
      `${targetTable}."${col}" = ${sourceTable}."${col}"`
    ).join(' AND ');

    // Build UPDATE SET clause
    const updateColumns = columns.filter(col => !this.uniqueKeyColumns.includes(col));
    const updateSet = updateColumns.map(col =>
      `"${col}" = ${sourceTable}."${col}"`
    ).join(', ');
    const matchedClause = updateSet
      ? `WHEN MATCHED THEN
        UPDATE SET ${updateSet}`
      : '';

    // Build INSERT columns and values
    const insertColumns = columns.map(col => `"${col}"`).join(', ');
    const insertValues = columns.map(col => `${sourceTable}."${col}"`).join(', ');

    const query = `
      MERGE INTO ${targetTable}
      USING ${sourceTable}
      ON ${onClause}
      ${matchedClause}
      WHEN NOT MATCHED THEN
        INSERT (${insertColumns})
        VALUES (${insertValues})
    `;

    await this.executeQuery(query, 'dml');
  }
  //----------------------------------------------------------------
};
