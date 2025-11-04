/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

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
          }
        }),
        uniqueKeyColumns,
        schema,
        description
      );

      this.checkIfGoogleBigQueryIsConnected();

      this.loadTableSchema();

      this.updatedRecordsBuffer = {};
      
      // Initialize counter for tracking total records processed
      this.totalRecordsProcessed = 0;

    
    }

  //---- loads Google BigQuery Table Schema ---------------------------
    loadTableSchema() {

      this.existingColumns = this.getAListOfExistingColumns() || {};

      // If there are no existing fields, it means the table has not been created yet
      if( Object.keys(this.existingColumns).length == 0 ) {
        this.createDatasetIfItDoesntExist();
        this.existingColumns = this.createTableIfItDoesntExist();
      } else {
        // Check if there are new columns from Fields config
        let selectedFields = this.getSelectedFields();
        let newFields = selectedFields.filter( column => !Object.keys(this.existingColumns).includes(column) );
        if( newFields.length > 0 ) {
          this.addNewColumns(newFields);
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
    getAListOfExistingColumns() {

        let query = "----- Getting a list of existing columns ------\n";
        
        query += `DECLARE dataset_exists BOOL;
        SET dataset_exists = EXISTS (
          SELECT 1
          FROM \`${this.config.DestinationProjectID.value}.INFORMATION_SCHEMA.SCHEMATA\`
          WHERE schema_name = '${this.config.DestinationDatasetName.value}'
        );
        IF dataset_exists THEN 
          SELECT column_name, data_type
          FROM \`${this.config.DestinationDatasetID.value}.INFORMATION_SCHEMA.COLUMNS\`
          WHERE table_name = '${this.config.DestinationTableName.value}';
        END IF`;

        /*let query = `SELECT column_name, data_type
        FROM \`${this.config.DestinationDatasetID.value}.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = '${this.config.DestinationTableName.value}'`;*/

        let queryResults = this.executeQuery(query);

        let columns = {};

        if( queryResults.rows ) {
          queryResults.rows.map(row => {
            columns[ row.f[0].v ]  = {"name": row.f[0].v, "type": row.f[1].v}
          });
        } else if (Array.isArray(queryResults)) {
          queryResults.map(row => {
            columns[ row.column_name ] = {"name": row.column_name, "type": row.data_type}
          });
        }

        return columns;

    }


  //---- createDatasetIfItDoesntExist --------------------------------
    createDatasetIfItDoesntExist() {

      let query = `---- Create Dataset if it not exists -----\n`;
      query += `CREATE SCHEMA IF NOT EXISTS \`${this.config.DestinationProjectID.value}.${this.config.DestinationDatasetName.value}\`
      OPTIONS (
        location = '${this.config.DestinationLocation.value}'
      )`;

      this.executeQuery(query);

    }

  //---- createTableIfItDoesntExist ----------------------------------
    createTableIfItDoesntExist() {

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
          columnDescription = ` OPTIONS(description="${this.schema[ columnName ]["description"]}")`;
        }

        if( "GoogleBigQueryPartitioned" in this.schema[ columnName ] 
        && this.schema[ columnName ]["GoogleBigQueryPartitioned"] ) {
          columnPartitioned = columnName;
        }

        columns.push(`${columnName} ${columnType}${columnDescription}`);
        
        existingColumns[ columnName ] = {"name": columnName, "type": columnType};

      }

      columns.push(`PRIMARY KEY (${this.uniqueKeyColumns.join(",")}) NOT ENFORCED`);

      columns = columns.join(",\n");

      let query = `---- Creating table if it not exists -----\n`;
      query += `CREATE TABLE IF NOT EXISTS \`${this.config.DestinationDatasetID.value}.${this.config.DestinationTableName.value}\` (\n${columns})`

      if( columnPartitioned ) {
        query += `\nPARTITION BY ${columnPartitioned}`;
      }

      if( this.description ) {
        query += `\nOPTIONS(description="${this.description}")`;
      }

      this.executeQuery(query);
      this.config.logMessage(`Table ${this.config.DestinationDatasetID.value}.${this.config.DestinationTableName.value} was created`);

      return existingColumns;

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
            columnDescription = ` OPTIONS (description = "${this.schema[ columnName ]["description"]}")`;
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
          console.log(newFields);
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
          this.executeMergeQueryRecursively(remainingRecords, batchSize);
        }
        
      } catch (error) {
        // If query fails due to size (even though we checked), reduce batch size
        if (error.message && error.message.includes('query is too large')) {
          console.log(`Query execution failed due to size. Reducing batch size from ${batchSize} to ${Math.floor(batchSize/2)}`);
          this.executeMergeQueryRecursively(recordKeys, Math.floor(batchSize / 2));
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

          } else if( ( columnType.toUpperCase() == "DATE") && (record[ columnName ] instanceof Date) ) {

            columnValue = DateUtils.formatDate( record[ columnName ], "UTC", "yyyy-MM-dd" );

          } else if( (columnType.toUpperCase() == "DATETIME") && (record[ columnName ] instanceof Date) ) {

            columnValue = DateUtils.formatDate( record[ columnName ], "UTC", "yyyy-MM-dd HH:mm:ss" );

          } else {

            columnValue = this.obfuscateSpecialCharacters( record[ columnName ] );

          }
          
          
          if (columnValue === null) {
            fields.push(`SAFE_CAST(NULL AS ${columnType}) ${columnName}`);
          } else {
            fields.push(`SAFE_CAST("${columnValue}" AS ${columnType}) ${columnName}`);
          }

        }

        rows.push(`SELECT ${fields.join(",\n\t")}`);
      }
       
      let existingColumnsNames = Object.keys(this.existingColumns);
      let query = `MERGE INTO \`${this.config.DestinationDatasetID.value}.${this.config.DestinationTableName.value}\` AS target
      USING (
        ${rows.join("\n\nUNION ALL\n\n")}
      ) AS source
      
      ON ${this.uniqueKeyColumns.map(item => ("target." + item + " = source." + item)).join("\n AND ")}

        WHEN MATCHED THEN
        UPDATE SET
          ${existingColumnsNames.map(item => "target." + item + " = source." + item).join(",\n")}
        WHEN NOT MATCHED THEN
        INSERT (
          ${existingColumnsNames.join(", ")}
        )
        VALUES (
          ${existingColumnsNames.map(item => "source."+item).join(", ")}
        )`;

      return query;
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
      let bigqueryClient = null;
      if (this.config.ServiceAccountJson && this.config.ServiceAccountJson.value) {
        const { JWT } = require('google-auth-library');
        const credentials = JSON.parse(this.config.ServiceAccountJson.value);
        const authClient = new JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes: ['https://www.googleapis.com/auth/bigquery'],
        });
        bigqueryClient = new BigQuery({
          projectId: this.config.ProjectID.value || credentials.project_id,
          authClient
        });
      } else {
        throw new Error("Service account JSON is required to connect to Google BigQuery in Node.js environment");
      }

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
      return this.schema[columnName]["GoogleBigQueryType"] || this._convertTypeToStorageType(this.schema[columnName]["type"]?.toLowerCase());
    }

  //---- _convertTypeToStorageType ------------------------------------
    /**
     * Converts generic type to BigQuery-specific type
     * @param {string} genericType - Generic type from schema
     * @returns {string} BigQuery column type
     */
    _convertTypeToStorageType(genericType) {
      if (!genericType) return 'STRING';
      
      // TODO: Move types to constants and refactor schemas
      
      switch (genericType.toLowerCase()) {
        // Integer types
        case 'integer':
        case 'int32':
        case 'int64':
        case 'unsigned int32':
        case 'long':
          return 'INTEGER';
        
        // Float types
        case 'float':
        case 'number':
        case 'double':
          return 'FLOAT64';
        case 'decimal':
          return 'NUMERIC';
        
        // Boolean types
        case 'bool':
        case 'boolean':
          return 'BOOL';
        
        // Date/time types
        case 'datetime':
          return 'DATETIME';
        case 'date':
          return 'DATE';
        case 'timestamp':
          return 'TIMESTAMP';
        
        // Default to STRING for unknown types
        default:
          return 'STRING';
      }
    }

}