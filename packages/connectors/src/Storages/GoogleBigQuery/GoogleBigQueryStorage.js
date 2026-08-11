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
  static parameters = {
    DestinationLocation: {
      isRequired: 'US',
      requiredType: 'string',
    },
    DestinationDatasetID: {
      isRequired: true,
      requiredType: 'string',
    },
    DestinationTableName: {
      isRequired: true,
      default: 'Data',
    },
    DestinationProjectID: {
      isRequired: true,
    },
    DestinationDatasetName: {
      isRequired: true,
    },
    ProjectID: {
      isRequired: true,
    },
    MaxBufferSize: {
      isRequired: true,
      default: 250,
    },
    ServiceAccountJson: {
      isRequired: false,
      requiredType: 'string',
      default: null,
    },
    OAuthAccessToken: {
      isRequired: false,
      requiredType: 'string',
      default: null,
    },
    OAuthRefreshToken: {
      isRequired: false,
      requiredType: 'string',
      default: null,
    },
    OAuthAccessTokenExpiry: {
      isRequired: false,
      requiredType: 'number',
      default: null,
    },
    OAuthClientId: {
      isRequired: false,
      requiredType: 'string',
      default: null,
    },
    OAuthClientSecret: {
      isRequired: false,
      requiredType: 'string',
      default: null,
    },
  };

  //---- constructor -------------------------------------------------
  /**
   * Storage class for Google BigQuery
   *
   * @param context (object) instance of AbstractContext
   * @param uniqueKeyColumns (mixed) a name of column with unique key or array with columns names
   * @param schema (object) object with structure like {fieldName: {type: "number", description: "smth" } }
   * @param description (string) string with storage description }
   */
  constructor(context, uniqueKeyColumns, schema = null, description = null) {
    super(context, uniqueKeyColumns, schema, description);

    // Built lazily by getBigQueryClient() and reused for the whole run.
    this._bigqueryClient = null;

    // Derive defaults from DestinationDatasetID when project/dataset names are not
    // explicitly provided. The legacy implementation computed these in
    // mergeParameters using `config.DestinationDatasetID.value.split(".")`; we
    // replicate that here, post-registration.
    const datasetIdParam = this.context.getParameter('DestinationDatasetID');
    const datasetId = datasetIdParam?.value;
    if (typeof datasetId === 'string' && datasetId.includes('.')) {
      const [projectPart, datasetPart] = datasetId.split('.');
      if (this.context.storageConfig.DestinationProjectID?.value === undefined) {
        this.context.storageConfig.DestinationProjectID = { value: projectPart };
      }
      if (this.context.storageConfig.DestinationDatasetName?.value === undefined) {
        this.context.storageConfig.DestinationDatasetName = { value: datasetPart };
      }
      if (this.context.storageConfig.ProjectID?.value === undefined) {
        this.context.storageConfig.ProjectID = { value: projectPart };
      }
    }

    this.updatedRecordsBuffer = {};

    // Initialize counter for tracking total records processed
    this.totalRecordsProcessed = 0;
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
    this.existingColumns = (await this.getAListOfExistingColumns()) || {};

    // If there are no existing fields, it means the table has not been created yet
    if (Object.keys(this.existingColumns).length == 0) {
      await this.createDatasetIfItDoesntExist();
      this.existingColumns = await this.createTableIfItDoesntExist();
    } else {
      // Check if there are new columns from Fields config
      let selectedFields = this.getSelectedFields();
      let newFields = selectedFields.filter(
        column => !Object.keys(this.existingColumns).includes(column)
      );
      if (newFields.length > 0) {
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
    const projectId = this.context.getParameter('DestinationProjectID')?.value;
    const datasetName = this.context.getParameter('DestinationDatasetName')?.value;
    const datasetId = this.context.getParameter('DestinationDatasetID')?.value;
    const tableName = this.context.getParameter('DestinationTableName')?.value;

    let query = '----- Getting a list of existing columns ------\n';

    query += `DECLARE dataset_exists BOOL;
        SET dataset_exists = EXISTS (
          SELECT 1
          FROM \`${projectId}.INFORMATION_SCHEMA.SCHEMATA\`
          WHERE schema_name = '${datasetName}'
        );
        IF dataset_exists THEN
          SELECT column_name, data_type
          FROM \`${datasetId}.INFORMATION_SCHEMA.COLUMNS\`
          WHERE table_name = '${tableName}'
          ORDER BY ordinal_position;
        END IF`;

    let queryResults = await this.executeQuery(query);

    let columns = {};

    if (queryResults.rows) {
      queryResults.rows.map(row => {
        columns[row.f[0].v] = { name: row.f[0].v, type: row.f[1].v };
      });
    } else if (Array.isArray(queryResults)) {
      queryResults.map(row => {
        columns[row.column_name] = { name: row.column_name, type: row.data_type };
      });
    }

    return columns;
  }

  //---- createDatasetIfItDoesntExist --------------------------------
  async createDatasetIfItDoesntExist() {
    const projectId = this.context.getParameter('DestinationProjectID')?.value;
    const datasetName = this.context.getParameter('DestinationDatasetName')?.value;
    const location = this.context.getParameter('DestinationLocation')?.value;

    let query = `---- Create Dataset if it not exists -----\n`;
    query += `CREATE SCHEMA IF NOT EXISTS \`${projectId}.${datasetName}\`
      OPTIONS (
        location = '${location}'
      )`;

    await this.executeQuery(query);
  }

  //---- createTableIfItDoesntExist ----------------------------------
  /**
   * @param {boolean} quoteColumnNames - backtick-quote column identifiers. Snapshot
   *   staging tables mirror whatever column names the source produced, which for a
   *   spreadsheet-style source may contain spaces or reserved words; the normal
   *   incremental path keeps unquoted names so existing tables are unaffected.
   */
  async createTableIfItDoesntExist(quoteColumnNames = false) {
    let columns = [];
    let columnPartitioned = null;
    let existingColumns = {};

    let selectedFields = this.getSelectedFields();
    let tableColumns = selectedFields.length > 0 ? selectedFields : this.uniqueKeyColumns;

    for (let i in tableColumns) {
      let columnName = tableColumns[i];
      let columnDescription = '';

      if (!(columnName in this.schema)) {
        throw new Error(`Required field ${columnName} not found in schema`);
      }

      let columnType = this.getColumnType(columnName);

      if ('description' in this.schema[columnName]) {
        columnDescription = ` OPTIONS(description="${this.obfuscateSpecialCharacters(this.schema[columnName]['description'])}")`;
      }

      if (
        'GoogleBigQueryPartitioned' in this.schema[columnName] &&
        this.schema[columnName]['GoogleBigQueryPartitioned']
      ) {
        columnPartitioned = columnName;
      }

      const sqlColumnName = quoteColumnNames ? quoteBigQueryIdentifier(columnName) : columnName;
      columns.push(`${sqlColumnName} ${columnType}${columnDescription}`);

      existingColumns[columnName] = { name: columnName, type: columnType };
    }

    const primaryKeyColumns = quoteColumnNames
      ? this.uniqueKeyColumns.map(quoteBigQueryIdentifier)
      : this.uniqueKeyColumns;
    columns.push(`PRIMARY KEY (${primaryKeyColumns.join(',')}) NOT ENFORCED`);

    columns = columns.join(',\n');

    const datasetId = this.context.getParameter('DestinationDatasetID')?.value;
    const tableName = this.context.getParameter('DestinationTableName')?.value;

    let query = `---- Creating table if it not exists -----\n`;
    query += `CREATE TABLE IF NOT EXISTS \`${datasetId}.${tableName}\` (\n${columns})`;

    if (columnPartitioned) {
      query += `\nPARTITION BY ${quoteColumnNames ? quoteBigQueryIdentifier(columnPartitioned) : columnPartitioned}`;
    }

    if (this.description) {
      query += `\nOPTIONS(description="${this.description}")`;
    }

    await this.executeQuery(query);
    this.context.log(LOG_LEVEL.INFO, `Table ${datasetId}.${tableName} was created`);

    return existingColumns;
  }

  //---- replaceData -------------------------------------------------
  /**
   * Publish a full-refresh snapshot: load every row into a staging table,
   * validate its row count, then swap it over the live table.
   * @param {data} array of assoc objects with records to save
   * @returns {Promise<void>}
   */
  async replaceData(data) {
    this.checkIfGoogleBigQueryIsConnected();
    await this.createDatasetIfItDoesntExist();

    const destinationTableParam = this.context.getParameter('DestinationTableName');
    const liveTableName = destinationTableParam.value;
    const stagingTableName = this.createSnapshotTableName('staging');
    const originalExistingColumns = this.existingColumns;
    const originalTotalRecordsProcessed = this.totalRecordsProcessed;
    const originalQuoteFieldIdentifiers = this.quoteFieldIdentifiers;
    const liveColumns = await this.getAListOfExistingColumns();
    let stagingTableCreated = false;
    let published = false;

    try {
      // The whole write path reads the destination from config, so staging is
      // entered by repointing that parameter rather than threading a table
      // name through every method. _snapshotLiveTableName keeps analytics
      // attributed to the configured table while the swap is in flight.
      this._snapshotLiveTableName = liveTableName;
      destinationTableParam.value = stagingTableName;
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
      destinationTableParam.value = liveTableName;
      await this.publishSnapshotTable(
        stagingTableName,
        liveTableName,
        stagedColumns,
        this.hasSameSchema(liveColumns, stagedColumns, normalizeBigQueryType)
      );
      this.existingColumns = stagedColumns;
      this.updatedRecordsBuffer = {};
      published = true;

      const datasetId = this.context.getParameter('DestinationDatasetID')?.value;
      this.context.log(
        LOG_LEVEL.INFO,
        `Snapshot import completed for ${datasetId}.${liveTableName}: ${data.length} rows`
      );
    } finally {
      destinationTableParam.value = liveTableName;
      this._snapshotLiveTableName = null;
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
          this.context.log(
            LOG_LEVEL.WARN,
            `Could not clean up BigQuery snapshot staging table ${stagingTableName}: ${error.message}`
          );
        }
      }
    }
  }
  //----------------------------------------------------------------

  //---- snapshot helpers -------------------------------------------
  /**
   * Build a collision-free staging table name that still fits BigQuery's
   * 1024-character table-name limit.
   * @param {string} kind - role of the table, e.g. "staging"
   * @returns {string}
   */
  createSnapshotTableName(kind) {
    const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    const suffix = `__owox_${kind}_${runId}`;
    const tableName = this.context.getParameter('DestinationTableName')?.value;
    return `${tableName.slice(0, 1024 - suffix.length)}${suffix}`;
  }

  /**
   * Refuse to publish a staging table whose row count does not match the
   * unique keys we set out to write — a short load must never silently
   * truncate the live table.
   * @param {string} tableName - staging table to count
   * @param {Array<object>} data - records the snapshot was built from
   */
  async validateSnapshotTable(tableName, data) {
    const datasetId = this.context.getParameter('DestinationDatasetID')?.value;
    const expectedRowCount = new Set(data.map(row => String(this.getUniqueKeyByRecordFields(row))))
      .size;
    const query = `SELECT COUNT(*) AS row_count FROM \`${datasetId}.${tableName}\``;
    const results = await this.executeQuery(query);
    const rows = Array.isArray(results) ? results : (results && results.rows) || [];
    const actualRowCount = rows.length ? Number(rows[0].row_count ?? rows[0].f?.[0]?.v) : NaN;

    if (!Number.isFinite(actualRowCount) || actualRowCount !== expectedRowCount) {
      throw new Error(
        `BigQuery snapshot validation failed for ${tableName}: expected ${expectedRowCount} rows, got ${Number.isFinite(actualRowCount) ? actualRowCount : 'an unreadable count'}`
      );
    }
  }

  /**
   * Swap staging over live. When the schema is unchanged the live table
   * object is preserved (truncate + insert inside a transaction) so views,
   * grants and policy tags on it survive; otherwise the table is replaced.
   * @param {string} stagingTableName
   * @param {string} liveTableName
   * @param {object} stagedColumns
   * @param {boolean} preserveTable - TRUE when the schemas match
   * @returns {Promise<object>}
   */
  publishSnapshotTable(stagingTableName, liveTableName, stagedColumns = {}, preserveTable = false) {
    const datasetId = this.context.getParameter('DestinationDatasetID')?.value;
    const liveTable = quoteBigQueryIdentifier(`${datasetId}.${liveTableName}`);
    const stagingTable = quoteBigQueryIdentifier(`${datasetId}.${stagingTableName}`);
    const query = preserveTable
      ? (() => {
          const columns = Object.keys(stagedColumns).map(quoteBigQueryIdentifier).join(', ');
          return `BEGIN TRANSACTION;\nTRUNCATE TABLE ${liveTable};\nINSERT INTO ${liveTable} (${columns}) SELECT ${columns} FROM ${stagingTable};\nCOMMIT TRANSACTION;`;
        })()
      : `CREATE OR REPLACE TABLE ${liveTable} COPY ${stagingTable}`;
    return this.executeQuery(query);
  }

  /**
   * @param {string} tableName - staging table to remove
   * @returns {Promise<object>}
   */
  dropSnapshotTable(tableName) {
    const datasetId = this.context.getParameter('DestinationDatasetID')?.value;
    return this.executeQuery(`DROP TABLE IF EXISTS \`${datasetId}.${tableName}\``);
  }
  //----------------------------------------------------------------

  //---- checkIfGoogleBigQueryIsConnected ---------------------
  checkIfGoogleBigQueryIsConnected() {
    if (typeof BigQuery == 'undefined') {
      throw new Error(
        `BigQuery client library is not available. Ensure @google-cloud/bigquery is installed.`
      );
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
    for (var i in newColumns) {
      let columnName = newColumns[i];

      // checking the field is exists in schema
      if (columnName in this.schema) {
        let columnDescription = '';

        let columnType = this.getColumnType(columnName);

        if ('description' in this.schema[columnName]) {
          columnDescription = ` OPTIONS (description = "${this.obfuscateSpecialCharacters(this.schema[columnName]['description'])}")`;
        }

        columns.push(`ADD COLUMN IF NOT EXISTS ${columnName} ${columnType}${columnDescription}`);
        this.existingColumns[columnName] = { name: columnName, type: columnType };
      }
    }

    // there are columns to add to table
    if (columns != []) {
      const datasetId = this.context.getParameter('DestinationDatasetID')?.value;
      const tableName = this.context.getParameter('DestinationTableName')?.value;

      query += `---- Adding new columns ----- \n`;
      query += `ALTER TABLE \`${datasetId}.${tableName}\`\n\n`;
      query += columns.join(',\n');
      await this.executeQuery(query);
      this.context.log(
        LOG_LEVEL.INFO,
        `Columns '${newColumns.join(',')}' were added to ${datasetId} dataset`
      );
    }
  }

  //---- saveData ----------------------------------------------------
  /**
   * Saving data to a storage
   * @param {data} array of assoc objects with records to save
   */
  async saveData(data) {
    const maxBufferSize = this.context.getParameter('MaxBufferSize')?.value;

    for (const row of data) {
      // if there are new columns in the first row it should be added first
      let newFields = Object.keys(row).filter(
        column => !Object.keys(this.existingColumns).includes(column)
      );

      if (newFields.length > 0) {
        this.context.log(LOG_LEVEL.INFO, `New columns detected: ${newFields.join(', ')}`);
        await this.addNewColumns(newFields);
      }

      this.addRecordToBuffer(row);
      await this.saveRecordsAddedToBuffer(maxBufferSize);
    }

    await this.saveRecordsAddedToBuffer();
  }

  // ------- addReordTuBuffer ---------------------
  /**
   * @param {record} object
   */
  addRecordToBuffer(record) {
    //record = this.stringifyNeastedFields(record);
    let uniqueKey = this.getUniqueKeyByRecordFields(record);

    this.updatedRecordsBuffer[uniqueKey] = record;
  }

  //---- saveRecordsAddedToBuffer ------------------------------------
  /**
   * Add records from buffer to a sheet
   * @param (integer) {maxBufferSize} record will be added only if buffer size if larger than this parameter
   */
  async saveRecordsAddedToBuffer(maxBufferSize = 0) {
    let bufferSize = Object.keys(this.updatedRecordsBuffer).length;

    // buffer must be saved only in case if it is larger than maxBufferSize
    if (bufferSize && bufferSize >= maxBufferSize) {
      this.context.log(
        LOG_LEVEL.INFO,
        `Starting BigQuery MERGE operation for ${bufferSize} records...`
      );

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
      throw new Error(
        'Cannot process records: even single record query exceeds BigQuery size limit'
      );
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
      this.context.log(
        LOG_LEVEL.WARN,
        `Query size (${Math.round(querySize / 1024)}KB) exceeds BigQuery limit. Reducing batch size from ${batchSize} to ${Math.floor(batchSize / 2)}`
      );

      // Recursively try with half the batch size
      await this.executeMergeQueryRecursively(recordKeys, Math.floor(batchSize / 2));
      return;
    }

    try {
      // Execute the query
      await this.executeQuery(query);
      this.totalRecordsProcessed += currentBatch.length;
      this.context.log(
        LOG_LEVEL.INFO,
        `BigQuery MERGE completed successfully for ${currentBatch.length} records (Total processed: ${this.totalRecordsProcessed})`
      );
      this._reportRowsWritten(currentBatch.length);

      // Process remaining records if any
      if (remainingRecords.length > 0) {
        await this.executeMergeQueryRecursively(remainingRecords, batchSize);
      }
    } catch (error) {
      // If query fails due to size (even though we checked), reduce batch size
      if (error.message && error.message.includes('query is too large')) {
        this.context.log(
          LOG_LEVEL.WARN,
          `Query execution failed due to size. Reducing batch size from ${batchSize} to ${Math.floor(batchSize / 2)}`
        );
        await this.executeMergeQueryRecursively(recordKeys, Math.floor(batchSize / 2));
      } else {
        // Re-throw other errors
        throw error;
      }
    }
  }

  //---- buildMergeQuery ---------------------------------------------
  /**
   * Builds a MERGE query for the specified record keys
   * @param {Array} recordKeys - Array of record keys to include in the query
   * @return {string} - The constructed MERGE query
   */
  buildMergeQuery(recordKeys) {
    let rows = [];

    for (let i = 0; i < recordKeys.length; i++) {
      const key = recordKeys[i];
      let record = this.stringifyNeastedFields(this.updatedRecordsBuffer[key]);
      let fields = [];

      for (var j in this.existingColumns) {
        let columnName = this.existingColumns[j]['name'];
        let columnType = this.existingColumns[j]['type'];
        let columnValue = null;

        if (record[columnName] === undefined || record[columnName] === null) {
          columnValue = null;
        } else if (columnType.toUpperCase() == 'DATE' && record[columnName] instanceof Date) {
          columnValue = DateUtils.formatDate(record[columnName]);
        } else if (columnType.toUpperCase() == 'DATETIME' && record[columnName] instanceof Date) {
          // Format as YYYY-MM-DD HH:MM:SS for BigQuery DATETIME
          const isoString = record[columnName].toISOString();
          columnValue = isoString.replace('T', ' ').substring(0, 19);
        } else {
          columnValue = this.obfuscateSpecialCharacters(record[columnName]);
        }

        if (columnValue === null) {
          fields.push(`SAFE_CAST(NULL AS ${columnType}) ${this.formatFieldIdentifier(columnName)}`);
        } else {
          fields.push(
            `SAFE_CAST("${columnValue}" AS ${columnType}) ${this.formatFieldIdentifier(columnName)}`
          );
        }
      }

      rows.push(`SELECT ${fields.join(',\n\t')}`);
    }

    let existingColumnsNames = Object.keys(this.existingColumns);
    const datasetId = this.context.getParameter('DestinationDatasetID')?.value;
    const tableName = this.context.getParameter('DestinationTableName')?.value;
    let query = `MERGE INTO \`${datasetId}.${tableName}\` AS target
      USING (
        ${rows.join('\n\nUNION ALL\n\n')}
      ) AS source

      ON ${this.uniqueKeyColumns.map(item => `target.${this.formatFieldIdentifier(item)} = source.${this.formatFieldIdentifier(item)}`).join('\n AND ')}

        WHEN MATCHED THEN
        UPDATE SET
          ${existingColumnsNames.map(item => `target.${this.formatFieldIdentifier(item)} = source.${this.formatFieldIdentifier(item)}`).join(',\n')}
        WHEN NOT MATCHED THEN
        INSERT (
          ${existingColumnsNames.map(item => this.formatFieldIdentifier(item)).join(', ')}
        )
        VALUES (
          ${existingColumnsNames.map(item => `source.${this.formatFieldIdentifier(item)}`).join(', ')}
        )`;

    return query;
  }

  /**
   * Column identifiers are left bare on the incremental path so existing
   * MERGE statements are byte-identical to before; snapshot staging turns
   * quoting on because it materialises whatever names the source produced.
   * @param {string} fieldName
   * @returns {string}
   */
  formatFieldIdentifier(fieldName) {
    return this.quoteFieldIdentifiers ? quoteBigQueryIdentifier(fieldName) : fieldName;
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
  /**
   * Builds the BigQuery client once and reuses it for the rest of the run.
   *
   * A long import issues many queries; constructing a fresh client per query threw
   * away the OAuth client that holds the refreshed access token, so every query kept
   * re-presenting the original — and once that expired mid-import the run failed.
   *
   * @returns {BigQuery}
   */
  getBigQueryClient() {
    if (this._bigqueryClient) {
      return this._bigqueryClient;
    }

    const oauthAccessTokenParam = this.context.getParameter('OAuthAccessToken');
    const serviceAccountJsonParam = this.context.getParameter('ServiceAccountJson');
    const projectIdParam = this.context.getParameter('ProjectID');

    if (oauthAccessTokenParam && oauthAccessTokenParam.value) {
      const { OAuth2Client } = require('google-auth-library');
      const oauth2Client = new OAuth2Client(
        this.context.getParameter('OAuthClientId')?.value,
        this.context.getParameter('OAuthClientSecret')?.value
      );
      oauth2Client.setCredentials({
        access_token: oauthAccessTokenParam.value,
        refresh_token: this.context.getParameter('OAuthRefreshToken')?.value || undefined,
        // `??`, not `||`: 0 is a valid number and must not be silently
        // dropped on our side. Note google-auth-library's own
        // isTokenExpiring() also treats 0 as "no known expiry" (falsy
        // check), so an exact epoch-0 expiry never triggers a refresh
        // either way — acceptable, since a real expiry is never 0.
        expiry_date: this.context.getParameter('OAuthAccessTokenExpiry')?.value ?? undefined,
      });
      this._bigqueryClient = new BigQuery({
        projectId: projectIdParam?.value,
        authClient: oauth2Client,
      });
    } else if (serviceAccountJsonParam && serviceAccountJsonParam.value) {
      const { JWT } = require('google-auth-library');
      const credentials = JSON.parse(serviceAccountJsonParam.value);
      const authClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/bigquery'],
      });
      this._bigqueryClient = new BigQuery({
        projectId: projectIdParam?.value || credentials.project_id,
        authClient,
      });
    } else {
      throw new Error(
        'Either OAuth token or Service Account JSON is required to connect to Google BigQuery'
      );
    }

    return this._bigqueryClient;
  }

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
    return String(inputString)
      .replace(/\\/g, '\\\\')
      .replace(/[\x00-\x1F]/g, ' ')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"');
  }

  //---- getColumnType -----------------------------------------------
  /**
   * Get column type for BigQuery from schema
   * @param {string} columnName - Name of the column
   * @returns {string} BigQuery column type
   */
  getColumnType(columnName) {
    return this._convertTypeToStorageType(this.schema[columnName]['type']);
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
};
