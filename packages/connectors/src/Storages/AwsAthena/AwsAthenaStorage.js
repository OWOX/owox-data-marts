/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

function quoteAthenaDdlIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function quoteAthenaDmlIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

var AwsAthenaStorage = class AwsAthenaStorage extends AbstractStorage {
  static parameters = {
    AWSRegion: {
      isRequired: true,
      requiredType: 'string',
    },
    AWSAccessKeyId: {
      isRequired: true,
      requiredType: 'string',
    },
    AWSSecretAccessKey: {
      isRequired: true,
      requiredType: 'string',
    },
    S3BucketName: {
      isRequired: true,
      requiredType: 'string',
    },
    S3Prefix: {
      isRequired: true,
      requiredType: 'string',
    },
    AthenaDatabaseName: {
      isRequired: true,
      requiredType: 'string',
    },
    DestinationTableName: {
      isRequired: true,
      requiredType: 'string',
    },
    AthenaOutputLocation: {
      isRequired: true,
      requiredType: 'string',
    },
    MaxBufferSize: {
      isRequired: true,
      default: 250,
    },
  };

  //---- constructor -------------------------------------------------
  /**
   * Class for managing data in AWS Athena with storage in S3
   *
   * @param context (object) instance of AbstractContext
   * @param uniqueKeyColumns (mixed) a name of column with unique key or array with columns names
   * @param schema (object) object with structure like {fieldName: {type: "string", description: "smth" } }
   * @param description (string) string with storage description }
   */
  constructor(context, uniqueKeyColumns, schema = null, description = null) {
    super(context, uniqueKeyColumns, schema, description);

    this.initAWS();

    this.updatedRecordsBuffer = {};
    this.existingColumns = {};

    this.uploadSid =
      new Date().toISOString().replace(/[-:.]/g, '') +
      '_' +
      Math.random().toString(36).substring(2, 15);
  }

  //---- init --------------------------------------------------------
  /**
   * Initializing storage
   */
  async init() {
    const success = await this.setupAthenaDatabase();
    if (success) {
      this.context.log(LOG_LEVEL.INFO, 'Database created or already exists');
    } else {
      throw new Error('Failed to create database');
    }
  }
  //----------------------------------------------------------------

  //---- initAWS ----------------------------------------------------
  /**
   * Initialize AWS SDK clients
   */
  initAWS() {
    try {
      // Require AWS SDK v3 clients

      // Store required modules
      this.Upload = Upload;
      this.DeleteObjectsCommand = DeleteObjectsCommand;
      this.ListObjectsV2Command = ListObjectsV2Command;

      // Configure AWS credentials
      const credentials = {
        accessKeyId: this.context.getParameter('AWSAccessKeyId')?.value,
        secretAccessKey: this.context.getParameter('AWSSecretAccessKey')?.value,
      };

      const region = this.context.getParameter('AWSRegion')?.value;

      // Create client instances
      this.s3Client = new S3Client({ region, credentials });
      this.athenaClient = new AthenaClient({ region, credentials });
    } catch (error) {
      throw new Error(
        `Failed to initialize AWS SDK v3: ${error.message}. Make sure the 'npm install' command was executed.`
      );
    }
  }

  //---- setupAthenaDatabase ---------------------------------------
  /**
   * Create database in Athena if it doesn't exist
   */
  setupAthenaDatabase() {
    return this.createDatabaseIfNotExists();
  }

  //---- createDatabaseIfNotExists ---------------------------------
  /**
   * Create Athena database if it doesn't exist
   */
  async createDatabaseIfNotExists() {
    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;

    const params = {
      QueryString: `CREATE SCHEMA IF NOT EXISTS \`${dbName}\``,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    };

    await this.executeQuery(params, 'ddl');
    this.context.log(LOG_LEVEL.INFO, `Database ${dbName} created or already exists`);
    return true;
  }

  //---- checkTableExists ------------------------------------------
  /**
   * Check if the target table exists in Athena
   */
  async checkTableExists() {
    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    const tableName = this.context.getParameter('DestinationTableName')?.value;
    const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;

    const params = {
      QueryString: `SHOW TABLES IN \`${dbName}\` LIKE '${tableName}'`,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    };

    try {
      const results = await this.executeQuery(params, 'ddl');
      if (results && results.length > 0) {
        return await this.getTableSchema();
      }
      return await this.createTargetTable();
    } catch {
      return await this.createTargetTable();
    }
  }

  //---- getTableSchema -------------------------------------------
  /**
   * Get the schema of the existing table
   */
  async getTableSchema() {
    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    const tableName = this.context.getParameter('DestinationTableName')?.value;
    const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;

    const params = {
      QueryString: `SHOW COLUMNS IN \`${dbName}\`.\`${tableName}\``,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    };

    const results = await this.executeQuery(params, 'ddl');
    let columns = {};
    if (results && results.length > 0) {
      results.forEach(row => {
        columns[row] = this.getColumnType(row);
      });
    }
    this.existingColumns = columns;
    return columns;
  }

  //---- createTargetTable ----------------------------------------------
  /**
   * Create the target table in Athena
   *
   * @param {String} tableName - table to create; defaults to the configured destination
   * @param {String} s3Prefix - S3 prefix backing the table
   * @param {Boolean} updateStorageState - adopt the created columns as this.existingColumns.
   *   Snapshot staging passes FALSE so a failed publication leaves the live schema intact.
   * @param {Boolean} quoteColumnNames - backtick-quote column identifiers in the DDL
   * @returns {Promise<Object>} - map of column name to Athena type
   */
  createTargetTable(
    tableName = this.context.getParameter('DestinationTableName')?.value,
    s3Prefix = this.context.getParameter('S3Prefix')?.value,
    updateStorageState = true,
    quoteColumnNames = false
  ) {
    let columnDefinitions = [];
    let existingColumns = {};

    // Process each unique key column from the schema
    for (let columnName of this.uniqueKeyColumns) {
      if (!(columnName in this.schema)) {
        throw new Error(`Required field ${columnName} not found in schema`);
      }

      // Use AthenaType if specified, otherwise fallback to schema type, default to string
      let columnType = this.getColumnType(columnName);
      let columnComment = this.getColumnComment(columnName);

      const sqlColumnName = quoteColumnNames ? quoteAthenaDdlIdentifier(columnName) : columnName;
      columnDefinitions.push(`${sqlColumnName} ${columnType}${columnComment}`);
      existingColumns[columnName] = columnType;
    }

    let selectedFields = this.getSelectedFields();

    // Add all other schema fields to the table
    for (let columnName in this.schema) {
      if (!this.uniqueKeyColumns.includes(columnName) && selectedFields.includes(columnName)) {
        // Use AthenaType if specified, otherwise fallback to schema type, default to string
        let columnType = this.getColumnType(columnName);
        let columnComment = this.getColumnComment(columnName);

        const sqlColumnName = quoteColumnNames ? quoteAthenaDdlIdentifier(columnName) : columnName;
        columnDefinitions.push(`${sqlColumnName} ${columnType}${columnComment}`);
        existingColumns[columnName] = columnType;
      }
    }

    const bucketName = this.context.getParameter('S3BucketName')?.value;
    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;

    const s3Location = `s3://${bucketName}/${s3Prefix}`;

    const query = `
      CREATE TABLE IF NOT EXISTS
      \`${dbName}\`.\`${tableName}\` (
        ${columnDefinitions.join(',\n        ')}
      )
      LOCATION '${s3Location}'
      TBLPROPERTIES (
        'table_type' = 'ICEBERG',
        'format' = 'PARQUET',
        'write_compression' = 'SNAPPY'
      )
    `;

    const params = {
      QueryString: query,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    };

    return this.executeQuery(params, 'ddl').then(() => {
      this.context.log(LOG_LEVEL.INFO, `Table \`${dbName}\`.\`${tableName}\` created`);
      if (updateStorageState) {
        this.existingColumns = existingColumns;
      }
      return existingColumns;
    });
  }

  //---- dropTargetTable ----------------------------------------------
  /**
   * Drop the target table in Athena if it exists.
   *
   * @param {String} tableName - table to drop; defaults to the configured destination
   * @returns {Promise<Boolean>}
   */
  dropTargetTable(tableName = this.context.getParameter('DestinationTableName')?.value) {
    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;
    const query = `DROP TABLE IF EXISTS \`${dbName}\`.\`${tableName}\``;

    const params = {
      QueryString: query,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    };

    return this.executeQuery(params, 'ddl').then(() => {
      this.context.log(
        LOG_LEVEL.INFO,
        `Table \`${dbName}\`.\`${tableName}\` dropped if it existed`
      );
      return true;
    });
  }

  //---- replaceData -------------------------------------------------
  /**
   * Replace destination table with the current source snapshot.
   *
   * Athena has no atomic swap, so publication is a rename dance: the live
   * table steps aside into a backup name, staging takes the live name, and a
   * failure between the two renames restores the backup. A run that dies in
   * that window leaves the backup behind, which the next run recovers.
   *
   * @param {Array} data - Array of records to save
   */
  async replaceData(data) {
    await this.createDatabaseIfNotExists();
    const runId = this.createSnapshotRunId();
    const liveTableName = this.context.getParameter('DestinationTableName')?.value;
    await this.recoverSnapshotBackupIfNeeded(liveTableName);
    const stagingTableName = this.createSnapshotTableName('staging', runId);
    const backupTableName = this.createSnapshotTableName('backup', runId);
    const snapshotRoot = this.createSnapshotS3Root(liveTableName);
    const stagingPrefix = `${snapshotRoot}/${runId}`;
    const tempFolder = `${this.context.getParameter('S3Prefix')?.value}_temp/${runId}`;
    const tempTableName = this.createSnapshotTableName('temp', runId);
    let stagingTableCreated = false;
    let backupTableCreated = false;
    let snapshotPublished = false;

    try {
      stagingTableCreated = true;
      const stagingColumns = await this.createTargetTable(
        stagingTableName,
        stagingPrefix,
        false,
        true
      );

      if (data.length) {
        this.context.log(LOG_LEVEL.INFO, `Saving ${data.length} snapshot records to Athena`);
        await this.uploadDataToS3TempFolder(data, tempFolder);
        await this.createTempTable(tempFolder, runId, stagingColumns, tempTableName, true, true);
        await this.mergeDataFromTempTable(
          tempTableName,
          runId,
          stagingTableName,
          stagingColumns,
          true
        );
      }

      await this.validateSnapshotTable(stagingTableName, data);

      if (await this.tableExists(liveTableName)) {
        await this.renameTable(liveTableName, backupTableName);
        backupTableCreated = true;
      }

      try {
        await this.renameTable(stagingTableName, liveTableName);
        stagingTableCreated = false;
        snapshotPublished = true;
      } catch (publishError) {
        if (backupTableCreated) {
          try {
            await this.renameTable(backupTableName, liveTableName);
            backupTableCreated = false;
          } catch (rollbackError) {
            this.context.log(
              LOG_LEVEL.ERROR,
              `Athena snapshot publication failed and the live table remains in backup table ${backupTableName}: ${rollbackError.message}`
            );
            publishError.rollbackError = rollbackError;
          }
        }
        throw publishError;
      }

      this.existingColumns = stagingColumns;
      const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
      this.context.log(
        LOG_LEVEL.INFO,
        `Snapshot import completed for \`${dbName}\`.\`${liveTableName}\`: ${data.length} rows`
      );
    } finally {
      await this.cleanupSnapshotResources({
        tempFolder,
        tempTableName,
        stagingTableName: stagingTableCreated ? stagingTableName : null,
        backupTableName: snapshotPublished && backupTableCreated ? backupTableName : null,
        snapshotRoot,
        stagingPrefix,
        snapshotPublished,
      });
    }
  }

  //---- snapshot helpers -------------------------------------------
  /**
   * @returns {String} - token that keeps one run's snapshot objects apart from another's
   */
  createSnapshotRunId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }

  /**
   * @param {String} kind - role of the table: staging, backup or temp
   * @param {String} runId - token from createSnapshotRunId()
   * @returns {String} - name truncated to Athena's 255-character limit
   */
  createSnapshotTableName(kind, runId) {
    const suffix = `__owox_${kind}_${runId}`;
    const tableName = this.context.getParameter('DestinationTableName')?.value;
    return `${tableName.slice(0, 255 - suffix.length)}${suffix}`;
  }

  /**
   * @param {String} tableName - live table the snapshots belong to
   * @returns {String} - S3 prefix holding every snapshot of that table
   */
  createSnapshotS3Root(tableName) {
    const s3Prefix = this.context.getParameter('S3Prefix')?.value;
    return `${s3Prefix}_snapshot/${encodeURIComponent(tableName)}`;
  }

  /**
   * @param {String} tableName
   * @returns {Promise<Boolean>}
   */
  tableExists(tableName) {
    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;
    const escapedDatabaseName = String(dbName).replace(/'/g, "''");
    const escapedTableName = String(tableName).replace(/'/g, "''");
    const params = {
      QueryString: `SELECT table_name FROM information_schema.tables WHERE table_schema = '${escapedDatabaseName}' AND table_name = '${escapedTableName}'`,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    };

    return this.executeQuery(params, 'query').then(results =>
      (results || []).some(row => row.table_name === tableName)
    );
  }

  /**
   * Restore the live table from the newest backup left behind by a snapshot
   * that died between the two renames. Only runs when the live name is absent.
   *
   * @param {String} liveTableName
   * @returns {Promise<Boolean>} - TRUE when a backup was restored
   */
  async recoverSnapshotBackupIfNeeded(liveTableName) {
    if (await this.tableExists(liveTableName)) {
      return false;
    }

    const backupTables = await this.listSnapshotTables(liveTableName, 'backup');
    if (!backupTables.length) {
      return false;
    }

    // The run id starts with a base-36 timestamp, so sorting by name puts the
    // newest backup last — that is the one closest to the live table's content.
    backupTables.sort();
    const backupTableName = backupTables[backupTables.length - 1];
    await this.renameTable(backupTableName, liveTableName);
    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    this.context.log(
      LOG_LEVEL.INFO,
      `Recovered Athena table \`${dbName}\`.\`${liveTableName}\` from interrupted snapshot ${backupTableName}`
    );
    return true;
  }

  /**
   * @param {String} liveTableName
   * @param {String} kind - role of the table: staging, backup or temp
   * @returns {Promise<Array<String>>}
   */
  listSnapshotTables(liveTableName, kind) {
    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;
    const prefix = `${liveTableName}__owox_${kind}_`;
    const escapedPrefix = String(prefix).replace(/'/g, "''");
    const params = {
      QueryString: `SHOW TABLES IN \`${dbName}\` '*${escapedPrefix}*'`,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    };

    return this.executeQuery(params, 'ddl').then(results =>
      (results || [])
        .map(row => (typeof row === 'string' ? row : Object.values(row || {})[0]))
        .filter(tableName => typeof tableName === 'string' && tableName.startsWith(prefix))
    );
  }

  /**
   * @param {String} fromTableName
   * @param {String} toTableName
   * @returns {Promise}
   */
  renameTable(fromTableName, toTableName) {
    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;
    const params = {
      QueryString: `ALTER TABLE \`${dbName}\`.\`${fromTableName}\` RENAME TO \`${dbName}\`.\`${toTableName}\``,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    };

    return this.executeQuery(params, 'ddl');
  }

  /**
   * Refuse to publish a staging table whose row count does not match the data
   * we set out to write — a short load must never silently truncate the live table.
   *
   * @param {String} tableName - staging table to count
   * @param {Array} data - records the snapshot was built from
   */
  async validateSnapshotTable(tableName, data) {
    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;
    const expectedRowCount = data.length;
    const params = {
      QueryString: `SELECT COUNT(*) AS "row_count" FROM "${dbName}"."${tableName}"`,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    };
    const results = await this.executeQuery(params, 'query');
    const actualRowCount = results && results.length ? Number(results[0].row_count) : NaN;

    if (!Number.isFinite(actualRowCount) || actualRowCount !== expectedRowCount) {
      throw new Error(
        `Athena snapshot validation failed for ${tableName}: expected ${expectedRowCount} rows, got ${Number.isFinite(actualRowCount) ? actualRowCount : 'an unreadable count'}`
      );
    }
  }

  /**
   * Tear down everything the snapshot created. Obsolete S3 data is only
   * deleted once the tables that could still reference it are gone, so a
   * partial cleanup never strands the published snapshot without its files.
   *
   * @param {Object} resources - names and prefixes produced by replaceData()
   */
  async cleanupSnapshotResources({
    tempFolder,
    tempTableName,
    stagingTableName,
    backupTableName,
    snapshotRoot,
    stagingPrefix,
    snapshotPublished,
  }) {
    await this.runSnapshotCleanup(() => this.dropTempTable(tempTableName, true));
    await this.runSnapshotCleanup(() => this.deleteS3TempFolder(tempFolder, true));

    if (stagingTableName) {
      const stagingTableDropped = await this.runSnapshotCleanup(() =>
        this.dropTargetTable(stagingTableName)
      );
      if (stagingTableDropped) {
        await this.runSnapshotCleanup(() => this.deleteS3TempFolder(stagingPrefix, true));
      }
    }

    let backupTableDropped = true;
    if (backupTableName) {
      backupTableDropped = await this.runSnapshotCleanup(() =>
        this.dropTargetTable(backupTableName)
      );
    }

    if (snapshotPublished && backupTableDropped) {
      await this.runSnapshotCleanup(() => this.deleteS3ObjectsExcept(snapshotRoot, stagingPrefix));
    }
  }

  /**
   * Cleanup runs in a finally block, so a failure here must not replace the
   * error that got us there — report it and carry on.
   *
   * @param {Function} cleanup
   * @returns {Promise<Boolean>} - TRUE when the step succeeded
   */
  async runSnapshotCleanup(cleanup) {
    try {
      await cleanup();
      return true;
    } catch (error) {
      this.context.log(
        LOG_LEVEL.WARN,
        `Could not clean up Athena snapshot resource: ${error.message}`
      );
      return false;
    }
  }

  //---- addNewColumns -------------------------------------------
  /**
   * Add new columns to the Athena table
   *
   * @param {Array} newColumns - Array of column names to add
   * @returns {Promise}
   */
  addNewColumns(newColumns) {
    const columnsToAdd = [];

    for (let columnName of newColumns) {
      if (columnName in this.schema) {
        let columnType = this.getColumnType(columnName);
        let columnComment = this.getColumnComment(columnName);

        columnsToAdd.push(`${columnName} ${columnType}${columnComment}`);
        this.existingColumns[columnName] = columnType;
      }
    }

    if (columnsToAdd.length > 0) {
      const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
      const tableName = this.context.getParameter('DestinationTableName')?.value;
      const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;

      const query = `
        ALTER TABLE \`${dbName}\`.\`${tableName}\`
        ADD COLUMNS (${columnsToAdd.join(', ')})
      `;

      const params = {
        QueryString: query,
        ResultConfiguration: {
          OutputLocation: outputLocation,
        },
      };

      return this.executeQuery(params, 'ddl').then(() => {
        this.context.log(
          LOG_LEVEL.INFO,
          `Columns '${newColumns.join(',')}' were added to \`${dbName}\`.\`${tableName}\` table`
        );
        return newColumns;
      });
    }

    return Promise.resolve(newColumns);
  }

  //---- saveData ------------------------------------------------
  /**
   * Saving data to S3 and making it available in Athena
   * @param {Array} data - Array of objects with records to save
   * @returns {Promise}
   */
  async saveData(data) {
    // First check if target table exists, create if needed (even for empty data)
    await this.checkTableExists();

    // Check if we need to add new columns (even for empty data)
    const allColumns = new Set();
    if (data.length > 0) {
      data.forEach(row => {
        Object.keys(row).forEach(column => allColumns.add(column));
      });
    }

    const fieldsParam = this.context.getParameter('Fields');
    if (fieldsParam && fieldsParam.value) {
      this.getSelectedFields().forEach(columnName => {
        if (columnName && !allColumns.has(columnName)) {
          allColumns.add(columnName);
          if (data.length > 0) {
            data.forEach(row => {
              if (!row[columnName]) {
                row[columnName] = '';
              }
            });
          }
        }
      });
    }

    const existingColumnsSet = new Set(Object.keys(this.existingColumns));
    const newColumns = Array.from(allColumns).filter(column => !existingColumnsSet.has(column));
    if (newColumns.length > 0) {
      await this.addNewColumns(newColumns);
    }

    if (data.length === 0) {
      return;
    }

    this.context.log(LOG_LEVEL.INFO, `Saving ${data.length} records to Athena`);

    const s3Prefix = this.context.getParameter('S3Prefix')?.value;
    // Generate a unique temp folder name
    const tempFolder = `${s3Prefix}_temp/${this.uploadSid}`;

    // Upload batches of data to S3
    await this.uploadDataToS3TempFolder(data, tempFolder);
    const tempTableName = await this.createTempTable(tempFolder, this.uploadSid);
    await this.mergeDataFromTempTable(tempTableName, this.uploadSid);
    await this.cleanupTempResources(tempFolder, tempTableName);
  }

  //---- uploadDataToS3TempFolder ---------------------------------
  /**
   * Upload data to S3 temp folder in batches
   * @param {Array} data - Data records to upload
   * @param {String} tempFolder - Temporary folder name
   * @returns {Promise}
   */
  uploadDataToS3TempFolder(data, tempFolder) {
    const maxBufferSize = this.context.getParameter('MaxBufferSize')?.value;
    // Break data into batches of MaxBufferSize
    const batches = [];
    for (let i = 0; i < data.length; i += maxBufferSize) {
      batches.push(data.slice(i, i + maxBufferSize));
    }

    this.context.log(
      LOG_LEVEL.INFO,
      `Uploading ${data.length} records to S3 in ${batches.length} batches`
    );

    // Upload each batch sequentially
    return batches.reduce((promise, batch, index) => {
      return promise.then(() => this.uploadBatchToS3(batch, tempFolder, index));
    }, Promise.resolve());
  }

  //---- uploadBatchToS3 ------------------------------------------
  /**
   * Upload a single batch of data to S3
   * @param {Array} batch - Batch of records
   * @param {String} tempFolder - Temp folder name
   * @param {Number} batchIndex - Index of the batch
   * @returns {Promise}
   */
  uploadBatchToS3(batch, tempFolder, batchIndex) {
    // Convert records to JSON lines format
    const lines = batch
      .map(record => {
        return JSON.stringify(this.stringifyNeastedFields(record));
      })
      .join('\n');

    const prefixSol = new Date().toISOString().replace(/[-:.]/g, '');
    // Create a filename for this batch
    const filename = `${tempFolder}/batch_${batchIndex}_${prefixSol}.json`;

    const bucketName = this.context.getParameter('S3BucketName')?.value;
    // Use the Upload utility from @aws-sdk/lib-storage
    const uploadParams = {
      Bucket: bucketName,
      Key: filename,
      Body: lines,
      ContentType: 'application/json',
    };

    const upload = new this.Upload({
      client: this.s3Client,
      params: uploadParams,
    });

    return upload.done().then(() => {
      this.context.log(
        LOG_LEVEL.INFO,
        `Uploaded batch ${batchIndex + 1} (${batch.length} records) to S3`
      );
      this._reportRowsWritten(batch.length);
      return true;
    });
  }

  //---- createTempTable ------------------------------------------
  /**
   * Create a temporary table in Athena for the uploaded data
   * @param {String} tempFolder - S3 folder with temporary data
   * @param {String} prefixSol - Prefix for unique table name
   * @param {Object} existingColumns - columns to declare; defaults to the live table's
   * @param {String} tempTableName - explicit temp table name
   * @param {Boolean} stableJsonSerde - use the HCatalog SerDe with an explicit timestamp
   *   format. The default OpenX SerDe guesses timestamp formats per file, which is fine
   *   for a MERGE that only reads back what it just wrote but not for a snapshot that
   *   must round-trip values exactly.
   * @param {Boolean} quoteColumnNames - backtick-quote column identifiers in the DDL
   * @returns {Promise<String>} - Name of the created temp table
   */
  createTempTable(
    tempFolder,
    prefixSol,
    existingColumns = this.existingColumns,
    tempTableName = `${this.context.getParameter('DestinationTableName')?.value}_temp_${prefixSol}`,
    stableJsonSerde = false,
    quoteColumnNames = false
  ) {
    let columnDefinitions = [];
    // Add all columns from the target table
    for (let columnName in existingColumns) {
      const sqlColumnName = quoteColumnNames ? quoteAthenaDdlIdentifier(columnName) : columnName;
      columnDefinitions.push(`${sqlColumnName} ${existingColumns[columnName]}`);
    }

    const bucketName = this.context.getParameter('S3BucketName')?.value;
    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;

    const s3Location = `s3://${bucketName}/${tempFolder}`;

    const serde = stableJsonSerde
      ? `ROW FORMAT SERDE 'org.apache.hive.hcatalog.data.JsonSerDe'\n      WITH SERDEPROPERTIES ("timestamp.formats" = "yyyy-MM-dd HH:mm:ss.SSS")`
      : `ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'`;

    const query = `
      CREATE EXTERNAL TABLE IF NOT EXISTS
      \`${dbName}\`.\`${tempTableName}\` (
        ${columnDefinitions.join(',\n        ')}
      )
      ${serde}
      LOCATION '${s3Location}'
    `;

    const params = {
      QueryString: query,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    };

    return this.executeQuery(params, 'ddl').then(() => {
      this.context.log(LOG_LEVEL.INFO, `Temporary table ${tempTableName} created`);
      return tempTableName;
    });
  }

  //---- mergeDataFromTempTable -----------------------------------
  /**
   * Merge data from temporary table to target table
   * @param {String} tempTableName - Name of the temporary table
   * @param {String} _prefixSol - unused; keeps the positional slot aligned with createTempTable
   * @param {String} targetTableName - table to merge into; defaults to the destination
   * @param {Object} existingColumns - columns to merge; defaults to the live table's
   * @param {Boolean} quoteColumnNames - double-quote column identifiers in the DML
   * @returns {Promise<String>} - Returns temp table name for cleanup
   */
  mergeDataFromTempTable(
    tempTableName,
    _prefixSol,
    targetTableName = this.context.getParameter('DestinationTableName')?.value,
    existingColumns = this.existingColumns,
    quoteColumnNames = false
  ) {
    const columnNames = Object.keys(existingColumns);
    const column = name => (quoteColumnNames ? quoteAthenaDmlIdentifier(name) : name);

    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;

    // Build the MERGE query
    const query = `
      MERGE INTO "${dbName}"."${targetTableName}" tgt
      USING "${dbName}"."${tempTableName}" src
      ON ${this.uniqueKeyColumns.map(col => `tgt.${column(col)} = src.${column(col)}`).join(' AND ')}
      WHEN MATCHED THEN
        UPDATE SET ${columnNames.map(col => `${column(col)} = src.${column(col)}`).join(', ')}
      WHEN NOT MATCHED THEN
        INSERT (${columnNames.map(column).join(', ')})
        VALUES (${columnNames.map(col => `src.${column(col)}`).join(', ')})
    `;

    const params = {
      QueryString: query,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    };

    return this.executeQuery(params, 'query').then(() => {
      this.context.log(
        LOG_LEVEL.INFO,
        `Data merged from temporary table to \`${dbName}\`.\`${targetTableName}\``
      );
      return tempTableName;
    });
  }

  //---- cleanupTempResources -------------------------------------
  /**
   * Clean up temporary resources (drop table and delete S3 files)
   * @param {String} tempFolder - S3 folder with temporary data
   * @param {String} tempTableName - Name of the temporary table
   * @returns {Promise}
   */
  cleanupTempResources(tempFolder, tempTableName) {
    return this.dropTempTable(tempTableName).then(() => this.deleteS3TempFolder(tempFolder));
  }

  //---- dropTempTable --------------------------------------------
  /**
   * Drop the temporary table in Athena
   * @param {String} tempTableName - Name of the temporary table
   * @param {Boolean} ifExists - tolerate a missing table. Snapshot cleanup runs
   *   unconditionally, including on paths where the temp table was never created.
   * @returns {Promise}
   */
  dropTempTable(tempTableName, ifExists = false) {
    const dbName = this.context.getParameter('AthenaDatabaseName')?.value;
    const outputLocation = this.context.getParameter('AthenaOutputLocation')?.value;

    const query = `DROP TABLE ${ifExists ? 'IF EXISTS ' : ''}\`${dbName}\`.\`${tempTableName}\``;

    const params = {
      QueryString: query,
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
    };

    return this.executeQuery(params, 'ddl').then(() => {
      this.context.log(LOG_LEVEL.INFO, `Temporary table ${tempTableName} dropped`);
      return true;
    });
  }

  //---- deleteS3TempFolder ---------------------------------------
  /**
   * Delete all files in the temporary S3 folder
   * @param {String} tempFolder - S3 folder with temporary data
   * @param {Boolean} failOnPartialDelete - raise when any object survives, and page
   *   through the whole listing. The incremental path tolerates leftovers; a snapshot
   *   cannot, because stale files under a reused prefix would be read as live data.
   * @returns {Promise}
   */
  deleteS3TempFolder(tempFolder, failOnPartialDelete = false) {
    if (failOnPartialDelete) {
      return this.deleteAllS3TempObjects(tempFolder);
    }

    const bucketName = this.context.getParameter('S3BucketName')?.value;

    // First list all objects in the temp folder
    const listParams = {
      Bucket: bucketName,
      Prefix: tempFolder,
    };

    return this.s3Client.send(new this.ListObjectsV2Command(listParams)).then(data => {
      if (!data.Contents || data.Contents.length === 0) {
        return true;
      }

      // Create the delete request with the object keys
      const deleteParams = {
        Bucket: bucketName,
        Delete: {
          Objects: data.Contents.map(object => ({ Key: object.Key })),
        },
      };

      // Delete all objects in the temp folder
      return this.s3Client.send(new this.DeleteObjectsCommand(deleteParams)).then(() => {
        this.context.log(LOG_LEVEL.INFO, `Deleted ${data.Contents.length} temporary files from S3`);
        return true;
      });
    });
  }

  //---- deleteAllS3TempObjects -----------------------------------
  /**
   * Delete every object under a prefix, paging through the listing and
   * surfacing per-object failures instead of reporting success.
   *
   * @param {String} tempFolder - S3 prefix to empty
   * @returns {Promise<Boolean>}
   */
  async deleteAllS3TempObjects(tempFolder) {
    const bucketName = this.context.getParameter('S3BucketName')?.value;
    let continuationToken;
    let deletedCount = 0;

    do {
      const data = await this.s3Client.send(
        new this.ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: tempFolder,
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        })
      );
      const objects = (data.Contents || []).flatMap(object =>
        object.Key ? [{ Key: object.Key }] : []
      );

      if (objects.length) {
        const result = await this.s3Client.send(
          new this.DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: { Objects: objects },
          })
        );
        if (result.Errors?.length) {
          const failedKeys = result.Errors.map(error => error.Key || 'unknown').join(', ');
          throw new Error(`Failed to delete ${result.Errors.length} S3 objects: ${failedKeys}`);
        }
        deletedCount += objects.length;
      }

      continuationToken = data.IsTruncated ? data.NextContinuationToken : undefined;
      if (data.IsTruncated && !continuationToken) {
        throw new Error('S3 object listing was truncated without a continuation token');
      }
    } while (continuationToken);

    if (deletedCount) {
      this.context.log(LOG_LEVEL.INFO, `Deleted ${deletedCount} temporary files from S3`);
    }
    return true;
  }

  //---- deleteS3ObjectsExcept ------------------------------------
  /**
   * Delete every object under a prefix except those belonging to the snapshot
   * that was just published — that is how superseded snapshots are reclaimed
   * without touching the files the live table now points at.
   *
   * @param {String} prefix - snapshot root to sweep
   * @param {String} keepPrefix - prefix of the published snapshot to preserve
   * @returns {Promise<Boolean>}
   */
  async deleteS3ObjectsExcept(prefix, keepPrefix) {
    const bucketName = this.context.getParameter('S3BucketName')?.value;
    let continuationToken;
    let deletedCount = 0;
    const normalizedPrefix = `${String(prefix).replace(/\/+$/, '')}/`;
    const normalizedKeepPrefix = `${String(keepPrefix).replace(/\/+$/, '')}/`;

    do {
      const data = await this.s3Client.send(
        new this.ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: normalizedPrefix,
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        })
      );
      const objects = (data.Contents || []).flatMap(object =>
        object.Key && !object.Key.startsWith(normalizedKeepPrefix) ? [{ Key: object.Key }] : []
      );

      if (objects.length) {
        const result = await this.s3Client.send(
          new this.DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: { Objects: objects },
          })
        );
        if (result.Errors?.length) {
          const failedKeys = result.Errors.map(error => error.Key || 'unknown').join(', ');
          throw new Error(`Failed to delete ${result.Errors.length} S3 objects: ${failedKeys}`);
        }
        deletedCount += objects.length;
      }

      continuationToken = data.IsTruncated ? data.NextContinuationToken : undefined;
      if (data.IsTruncated && !continuationToken) {
        throw new Error('S3 object listing was truncated without a continuation token');
      }
    } while (continuationToken);

    if (deletedCount) {
      this.context.log(LOG_LEVEL.INFO, `Deleted ${deletedCount} obsolete snapshot files from S3`);
    }
    return true;
  }

  //---- executeQuery -----------------------------------------
  /**
   * Execute a query in Athena
   * @param {Object} params - Query parameters
   * @returns {Promise} - Results of the query
   */
  executeQuery(params, type = 'query') {
    // Start query execution
    return this.athenaClient.send(new StartQueryExecutionCommand(params)).then(data => {
      const queryExecutionId = data.QueryExecutionId;
      return this.checkQueryStatus(queryExecutionId, params.QueryString, type);
    });
  }

  //---- checkQueryStatus -------------------------------------
  /**
   * Check the status of an Athena query
   * @param {String} queryExecutionId - ID of the query to check
   * @returns {Promise} - Query results when complete
   */
  checkQueryStatus(queryExecutionId, queryString, type) {
    const params = {
      QueryExecutionId: queryExecutionId,
    };

    return this.athenaClient.send(new GetQueryExecutionCommand(params)).then(data => {
      const state = data.QueryExecution.Status.State;

      if (state === 'SUCCEEDED') {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(this.getQueryResults(queryExecutionId, queryString, type));
          }, 3000);
        });
      } else if (state === 'FAILED' || state === 'CANCELLED') {
        this.context.log(
          LOG_LEVEL.INFO,
          `Query ${queryExecutionId} ${state}: ${data.QueryExecution.Status.StateChangeReason || ''}. Error: ${data.QueryExecution.Status.Error?.Message || ''}`
        );
        throw new Error(`Query ${state}: ${data.QueryExecution.Status.StateChangeReason || ''}`);
      } else {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(this.checkQueryStatus(queryExecutionId, queryString, type));
          }, 3000);
        });
      }
    });
  }

  getDDLQueryResults(queryExecutionId, queryString) {
    const params = {
      QueryExecutionId: queryExecutionId,
    };

    return this.athenaClient.send(new GetQueryResultsCommand(params)).then(data => {
      if (data.Output) {
        if (typeof data.Output === 'string') {
          return data.Output.split('\n').map(line => line.trim());
        } else {
          this.context.log(
            LOG_LEVEL.INFO,
            `Query ${queryExecutionId} returned output data in unexpected format`
          );
          return [];
        }
      }
      return this.getQueryResults(queryExecutionId, queryString, 'query');
    });
  }

  //---- getQueryResults -------------------------------------
  /**
   * Get the results of a completed Athena query
   * @param {String} queryExecutionId - ID of the completed query
   * @returns {Promise} - Processed query results
   */
  getQueryResults(queryExecutionId, queryString, type) {
    if (type === 'ddl') {
      return this.getDDLQueryResults(queryExecutionId, queryString);
    }
    const params = {
      QueryExecutionId: queryExecutionId,
    };

    return this.athenaClient.send(new GetQueryResultsCommand(params)).then(data => {
      if (!data.ResultSet || !data.ResultSet.Rows) {
        return [];
      }

      const rows = data.ResultSet.Rows;

      // If no rows or only header row, return empty array
      if (rows.length <= 1) {
        return [];
      }

      // Extract header row
      const headerRow = rows[0].Data.map(item => item.VarCharValue);

      // Process result rows
      const results = [];
      for (let i = 1; i < rows.length; i++) {
        const rowData = rows[i].Data;
        const rowObj = {};

        for (let j = 0; j < headerRow.length; j++) {
          rowObj[headerRow[j]] = rowData[j].VarCharValue;
        }

        results.push(rowObj);
      }

      return results;
    });
  }

  //---- getColumnType -----------------------------------------------
  /**
   * Get column type for Athena from schema
   * @param {string} columnName - Name of the column
   * @returns {string} Athena column type
   */
  getColumnType(columnName) {
    return this._convertTypeToStorageType(this.schema[columnName]['type']);
  }

  //---- getColumnComment -----------------------------------------------
  /**
   * Get COMMENT clause for a column if description exists in schema
   * @param {string} columnName - Name of the column
   * @returns {string} COMMENT clause or empty string
   */
  getColumnComment(columnName) {
    if (columnName in this.schema && 'description' in this.schema[columnName]) {
      const escapedDescription = this.obfuscateSpecialCharacters(
        this.schema[columnName]['description']
      );
      return ` COMMENT '${escapedDescription}'`;
    }
    return '';
  }

  //---- obfuscateSpecialCharacters ------------------------------------
  /**
   * Escape special characters for SQL string literals
   * @param {string} inputString - String to escape
   * @returns {string} Escaped string
   */
  obfuscateSpecialCharacters(inputString) {
    return String(inputString)
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/\r\n/g, ' ') // Replace Windows line breaks with space
      .replace(/\n/g, ' ') // Replace Unix line breaks with space
      .replace(/\r/g, ' ') // Replace Mac line breaks with space
      .replace(/'/g, "''") // Escape single quotes
      .replace(/"/g, '\\"') // Escape double quotes
      .replace(/[\x00-\x1F]/g, ' '); // Replace control chars with space
  }

  //---- _convertTypeToStorageType ------------------------------------
  /**
   * Converts generic type to Athena-specific type.
   * Now uses UPPERCASE types from DataTypes constant.
   * @param {string} genericType - Generic type from schema (UPPERCASE)
   * @returns {string} Athena column type
   */
  _convertTypeToStorageType(genericType) {
    if (!genericType) return 'string';

    switch (genericType) {
      // Integer type
      case DATA_TYPES.INTEGER:
        return 'bigint';

      // Number type
      case DATA_TYPES.NUMBER:
        return 'double';

      // Boolean type
      case DATA_TYPES.BOOLEAN:
        return 'boolean';

      // Date/time types
      case DATA_TYPES.DATE:
        return 'date';
      case DATA_TYPES.DATETIME:
        return 'timestamp';
      case DATA_TYPES.TIMESTAMP:
        return 'timestamp';
      case DATA_TYPES.TIME:
        return 'string';

      // String type
      case DATA_TYPES.STRING:
        return 'string';

      // Array and Object types (serialized as JSON strings)
      case DATA_TYPES.ARRAY:
      case DATA_TYPES.OBJECT:
        return 'string';

      default:
        throw new Error(`Unknown type: ${genericType}`);
    }
  }
};
