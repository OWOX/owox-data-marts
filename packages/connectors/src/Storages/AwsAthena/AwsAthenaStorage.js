/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var AwsAthenaStorage = class AwsAthenaStorage extends AbstractStorage {
  //---- constructor -------------------------------------------------
  /**
   * Class for managing data in AWS Athena with storage in S3
   * 
   * @param config (object) instance of AbscractConfig
   * @param uniqueKeyColumns (mixed) a name of column with unique key or array with columns names
   * @param schema (object) object with structure like {fieldName: {type: "string", description: "smth" } }
   * @param description (string) string with storage description }
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
        S3BucketName: {
          isRequired: true,
          requiredType: "string"
        },
        S3Prefix: {
          isRequired: true,
          requiredType: "string"
        },
        AthenaDatabaseName: {
          isRequired: true,
          requiredType: "string"
        },
        DestinationTableName: {
          isRequired: true,
          requiredType: "string"
        },
        AthenaOutputLocation: {
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
    
    this.setupAthenaDatabase();
    
    this.uploadSid = new Date().toISOString().replace(/[-:.]/g, '') + "_" + Math.random().toString(36).substring(2, 15);
  }

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
        accessKeyId: this.config.AWSAccessKeyId.value,
        secretAccessKey: this.config.AWSSecretAccessKey.value
      };
      
      const region = this.config.AWSRegion.value;
      
      // Create client instances
      this.s3Client = new S3Client({ region, credentials });
      this.athenaClient = new AthenaClient({ region, credentials });
      
    } catch (error) {
      throw new Error(`Failed to initialize AWS SDK v3: ${error.message}. Make sure the 'npm install' command was executed.`);
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
  createDatabaseIfNotExists() {
    const params = {
      QueryString: `CREATE SCHEMA IF NOT EXISTS \`${this.config.AthenaDatabaseName.value}\``,
      ResultConfiguration: {
        OutputLocation: this.config.AthenaOutputLocation.value
      }
    };

    return this.executeQuery(params, 'ddl')
      .then(() => {
        this.config.logMessage(`Database ${this.config.AthenaDatabaseName.value} created or already exists`);
        return true;
      });
  }

  //---- checkTableExists ------------------------------------------
  /**
   * Check if the target table exists in Athena
   */
  checkTableExists() {
    const params = {
      QueryString: `SHOW TABLES IN \`${this.config.AthenaDatabaseName.value}\` LIKE '${this.config.DestinationTableName.value}'`,
      ResultConfiguration: {
        OutputLocation: this.config.AthenaOutputLocation.value
      }
    };

    return this.executeQuery(params, 'ddl')
      .then(results => {
        if (results && results.length > 0) {
          return this.getTableSchema();
        }
        return this.createTargetTable();
      })
      .catch(() => {
        return this.createTargetTable();
      });
  }

  //---- getTableSchema -------------------------------------------
  /**
   * Get the schema of the existing table
   */
  getTableSchema() {
    const params = {
      QueryString: `SHOW COLUMNS IN \`${this.config.AthenaDatabaseName.value}\`.\`${this.config.DestinationTableName.value}\``,
      ResultConfiguration: {
        OutputLocation: this.config.AthenaOutputLocation.value
      }
    };

    return this.executeQuery(params, 'ddl')
      .then(results => {
        let columns = {};
        if (results && results.length > 0) {
          results.forEach(row => {
            columns[row] = 'string';
          });
        }
        this.existingColumns = columns;
        return columns;
      })
      .catch(error => {
        return {};
      });
  }

  //---- createTargetTable ----------------------------------------------
  /**
   * Create the target table in Athena
   */
  createTargetTable() {
    let columnDefinitions = [];
    let existingColumns = {};
    
    // Process each unique key column from the schema
    for (let columnName of this.uniqueKeyColumns) {
      if (!(columnName in this.schema)) {
        throw new Error(`Required field ${columnName} not found in schema`);
      }
      
      // Use AthenaType if specified, otherwise fallback to schema type, default to string
      let columnType = this.getColumnType(columnName);
      
      columnDefinitions.push(`${columnName} ${columnType}`);
      existingColumns[columnName] = columnType;
    }

    let selectedFields = [];
    if (this.config.Fields && this.config.Fields.value) {
      selectedFields = this.config.Fields.value.split(',')
      .map(field => field.trim())
      .filter(field => field !== '')
      .map(field => field.split(' '))
      .filter(field => field.length === 2)
      .map(field => field[1]);
    } 
    
    // Add all other schema fields to the table
    for (let columnName in this.schema) {
      if (!this.uniqueKeyColumns.includes(columnName) && selectedFields.includes(columnName)) {
        // Use AthenaType if specified, otherwise fallback to schema type, default to string
        let columnType = this.getColumnType(columnName);
        
        columnDefinitions.push(`${columnName} ${columnType}`);
        existingColumns[columnName] = columnType;
      }
    }
    
    const s3Location = `s3://${this.config.S3BucketName.value}/${this.config.S3Prefix.value}`;
    
    const query = `
      CREATE TABLE IF NOT EXISTS 
      \`${this.config.AthenaDatabaseName.value}\`.\`${this.config.DestinationTableName.value}\` (
        ${columnDefinitions.join(",\n        ")}
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
        OutputLocation: this.config.AthenaOutputLocation.value
      }
    };
    
    return this.executeQuery(params, 'ddl')
      .then(() => {
        this.config.logMessage(`Table \`${this.config.AthenaDatabaseName.value}\`.\`${this.config.DestinationTableName.value}\` created`);
        this.existingColumns = existingColumns;
        return existingColumns;
      });
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
        let columnType = 'string';
        if ("AthenaType" in this.schema[columnName]) {
          columnType = this.schema[columnName]["AthenaType"];
        }
        
        columnsToAdd.push(`${columnName} ${columnType}`);
        this.existingColumns[columnName] = columnType;  
      }
    }
    
    if (columnsToAdd.length > 0) {
      const query = `
        ALTER TABLE \`${this.config.AthenaDatabaseName.value}\`.\`${this.config.DestinationTableName.value}\`
        ADD COLUMNS (${columnsToAdd.join(", ")})
      `;
      
      const params = {
        QueryString: query,
        ResultConfiguration: {
          OutputLocation: this.config.AthenaOutputLocation.value
        }
      };
      
      return this.executeQuery(params, 'ddl')
        .then(() => {
          this.config.logMessage(`Columns '${newColumns.join(",")}' were added to \`${this.config.AthenaDatabaseName.value}\`.\`${this.config.DestinationTableName.value}\` table`);
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
  saveData(data) {
    if (data.length === 0) {
      return;
    }
    let done = false;

    this.config.logMessage(`Saving ${data.length} records to Athena`);
    
    // First check if target table exists, create if needed
    this.checkTableExists()
      .then(() => {
        // Check if we need to add new columns
        const allColumns = new Set();
        data.forEach(row => {
          Object.keys(row).forEach(column => allColumns.add(column));
        });

        if (this.config.Fields.value) {
          this.config.Fields.value.split(', ')
            .map(field => field.trim())
            .filter(field => field !== '')
            .map(field => field.split(' '))
            .filter(field => field.length === 2)
            .map(field => field[1])
            .forEach(columnName => {
              if (columnName && !allColumns.has(columnName)) {
                allColumns.add(columnName);
                data.forEach(row => {
                  if (!row[columnName]) {
                    row[columnName] = '';
                  }
                });
            }
          });
        }
        
        const existingColumnsSet = new Set(Object.keys(this.existingColumns));
        const newColumns = Array.from(allColumns).filter(column => !existingColumnsSet.has(column));
        if (newColumns.length > 0) {
          return this.addNewColumns(newColumns);
        }
        return Promise.resolve();
      })
      .then(() => {
        // Generate a unique temp folder name
        const tempFolder = `${this.config.S3Prefix.value}_temp/${this.uploadSid}`;
        
        // Upload batches of data to S3
        return this.uploadDataToS3TempFolder(data, tempFolder)
          .then(() => this.createTempTable(tempFolder, this.uploadSid))
          .then((tempTableName) => this.mergeDataFromTempTable(tempTableName, this.uploadSid))
          .then((tempTableName) => this.cleanupTempResources(tempFolder, tempTableName))
          .then(() => done = true);
      });

      deasync.loopWhile(() => !done);
  }

  //---- uploadDataToS3TempFolder ---------------------------------
  /**
   * Upload data to S3 temp folder in batches
   * @param {Array} data - Data records to upload
   * @param {String} tempFolder - Temporary folder name
   * @returns {Promise}
   */
  uploadDataToS3TempFolder(data, tempFolder) {
    // Break data into batches of MaxBufferSize
    const batches = [];
    for (let i = 0; i < data.length; i += this.config.MaxBufferSize.value) {
      batches.push(data.slice(i, i + this.config.MaxBufferSize.value));
    }
    
    this.config.logMessage(`Uploading ${data.length} records to S3 in ${batches.length} batches`);
    
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
    const lines = batch.map(record => {
      return JSON.stringify(this.stringifyNeastedFields(record));
    }).join('\n');
    
    const prefixSol = new Date().toISOString().replace(/[-:.]/g, '');
    // Create a filename for this batch
    const filename = `${tempFolder}/batch_${batchIndex}_${prefixSol}.json`;
    
    // Use the Upload utility from @aws-sdk/lib-storage
    const uploadParams = {
      Bucket: this.config.S3BucketName.value,
      Key: filename,
      Body: lines,
      ContentType: 'application/json'
    };
    
    const upload = new this.Upload({
      client: this.s3Client,
      params: uploadParams
    });
    
    return upload.done()
      .then(() => {
        this.config.logMessage(`Uploaded batch ${batchIndex + 1} (${batch.length} records) to S3`);
        return true;
      });
  }

  //---- createTempTable ------------------------------------------
  /**
   * Create a temporary table in Athena for the uploaded data
   * @param {String} tempFolder - S3 folder with temporary data
   * @param {String} prefixSol - Prefix for unique table name
   * @returns {Promise<String>} - Name of the created temp table
   */
  createTempTable(tempFolder, prefixSol) {
    const tempTableName = `${this.config.DestinationTableName.value}_temp_${prefixSol}`;
    
    let columnDefinitions = [];
    // Add all columns from the target table
    for (let columnName in this.existingColumns) {
      columnDefinitions.push(`${columnName} ${this.existingColumns[columnName]}`);
    }
    
    const s3Location = `s3://${this.config.S3BucketName.value}/${tempFolder}`;
    
    
    
    const query = `
      CREATE EXTERNAL TABLE IF NOT EXISTS
      \`${this.config.AthenaDatabaseName.value}\`.\`${tempTableName}\` (
        ${columnDefinitions.join(",\n        ")}
      )
      ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
      LOCATION '${s3Location}'
    `;
    
    const params = {
      QueryString: query,
      ResultConfiguration: {
        OutputLocation: this.config.AthenaOutputLocation.value
      }
    };
    
    return this.executeQuery(params, 'ddl')
      .then(() => {
        this.config.logMessage(`Temporary table ${tempTableName} created`);
        return tempTableName;
      });
  }

  //---- mergeDataFromTempTable -----------------------------------
  /**
   * Merge data from temporary table to target table
   * @param {String} tempTableName - Name of the temporary table
   * @returns {Promise<String>} - Returns temp table name for cleanup
   */
  mergeDataFromTempTable(tempTableName) {
    const columnNames = Object.keys(this.existingColumns);
    
    // Build the MERGE query
    const query = `
      MERGE INTO "${this.config.AthenaDatabaseName.value}"."${this.config.DestinationTableName.value}" tgt
      USING "${this.config.AthenaDatabaseName.value}"."${tempTableName}" src
      ON ${this.uniqueKeyColumns.map(col => `tgt.${col} = src.${col}`).join(" AND ")}
      WHEN MATCHED THEN
        UPDATE SET ${columnNames.map(col => `${col} = src.${col}`).join(", ")}
      WHEN NOT MATCHED THEN
        INSERT (${columnNames.join(", ")})
        VALUES (${columnNames.map(col => `src.${col}`).join(", ")})
    `;
    
    const params = {
      QueryString: query,
      ResultConfiguration: {
        OutputLocation: this.config.AthenaOutputLocation.value
      }
    };
    
    return this.executeQuery(params, 'query')
      .then(() => {
          this.config.logMessage(`Data merged from temporary table to \`${this.config.AthenaDatabaseName.value}\`.\`${this.config.DestinationTableName.value}\``);
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
    return this.dropTempTable(tempTableName)
      .then(() => this.deleteS3TempFolder(tempFolder));
  }

  //---- dropTempTable --------------------------------------------
  /**
   * Drop the temporary table in Athena
   * @param {String} tempTableName - Name of the temporary table
   * @returns {Promise}
   */
  dropTempTable(tempTableName) {
    const query = `DROP TABLE \`${this.config.AthenaDatabaseName.value}\`.\`${tempTableName}\``;
    
    const params = {
      QueryString: query, 
      ResultConfiguration: {
        OutputLocation: this.config.AthenaOutputLocation.value
      }
    };
    
    return this.executeQuery(params, 'ddl')
      .then(() => {
        this.config.logMessage(`Temporary table ${tempTableName} dropped`);
        return true;
      });
  }

  //---- deleteS3TempFolder ---------------------------------------
  /**
   * Delete all files in the temporary S3 folder
   * @param {String} tempFolder - S3 folder with temporary data
   * @returns {Promise}
   */
  deleteS3TempFolder(tempFolder) {
    // First list all objects in the temp folder
    const listParams = {
      Bucket: this.config.S3BucketName.value,
      Prefix: tempFolder
    };
    
    return this.s3Client.send(new this.ListObjectsV2Command(listParams))
      .then(data => {
        if (!data.Contents || data.Contents.length === 0) {
          return true;
        }
        
        // Create the delete request with the object keys
        const deleteParams = {
          Bucket: this.config.S3BucketName.value,
          Delete: {
            Objects: data.Contents.map(object => ({ Key: object.Key }))
          }
        };
        
        // Delete all objects in the temp folder
        return this.s3Client.send(new this.DeleteObjectsCommand(deleteParams))
          .then(() => {
            this.config.logMessage(`Deleted ${data.Contents.length} temporary files from S3`);
            return true;
          });
      });
  }

  //---- executeQuery -----------------------------------------
  /**
   * Execute a query in Athena
   * @param {Object} params - Query parameters
   * @returns {Promise} - Results of the query
   */
  executeQuery(params, type = 'query') {
    // Start query execution
    return this.athenaClient.send(new StartQueryExecutionCommand(params))
      .then(data => {
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
      QueryExecutionId: queryExecutionId
    };
    
    return this.athenaClient.send(new GetQueryExecutionCommand(params))
      .then(data => {
        const state = data.QueryExecution.Status.State;
        
        if (state === 'SUCCEEDED') {
          return new Promise(resolve => {
            setTimeout(() => {
              resolve(this.getQueryResults(queryExecutionId, queryString, type));
            }, 3000);
          });
        } else if (state === 'FAILED' || state === 'CANCELLED') {
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
      QueryExecutionId: queryExecutionId
    };
    
    return this.athenaClient.send(new GetQueryResultsCommand(params))
    .then(data => {
       if (data.Output) {
        if (typeof data.Output === 'string') {
          return data.Output.split('\n').map(line => line.trim());
        } else {
          this.config.logMessage(`Query ${queryExecutionId} returned output data in unexpected format`);
          return [];
        }
       }
       return this.getQueryResults(queryExecutionId, queryString, 'query');
    })
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
      QueryExecutionId: queryExecutionId
    };
    
    return this.athenaClient.send(new GetQueryResultsCommand(params))
      .then(data => {
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
    return this.schema[columnName]["AthenaType"] || this._convertTypeToStorageType(this.schema[columnName]["type"]?.toLowerCase());
  }

  //---- _convertTypeToStorageType ------------------------------------
  /**
   * Converts generic type to Athena-specific type
   * @param {string} genericType - Generic type from schema
   * @returns {string} Athena column type
   */
  _convertTypeToStorageType(genericType) {
    if (!genericType) return 'string';
    
    // TODO: Move types to constants and refactor schemas
    
    switch (genericType.toLowerCase()) {
      // Integer types
      case 'integer':
      case 'int32':
      case 'unsigned int32':
        return 'int';
      case 'int64':
      case 'long':
        return 'bigint';
      
      // Float types
      case 'float':
      case 'number':
      case 'double':
        return 'double';
      case 'decimal':
        return 'decimal';
      
      // Boolean types
      case 'bool':
      case 'boolean':
        return 'boolean';
      
      // Date/time types
      case 'datetime':
      case 'timestamp':
        return 'timestamp';
      case 'date':
        return 'date';
      
      // Default to string for unknown types
      default:
        return 'string';
    }
  }
} 