/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var GoogleBigQueryStorage = class GoogleBigQueryStorage extends AbstractStorage {
  //---- constructor -------------------------------------------------
    /**
     * Asbstract class making Google BigQuery updateable in Apps Script
     * 
     * @param config (object) instance of AbscractConfig
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
          }
        }),
        uniqueKeyColumns,
        schema,
        description
      );

      this.checkIfGoogleBigQueryIsConnected();

      this.loadTableSchema();

      this.updatedRecordsBuffer = {};

    
    }

  //---- loads Google BigQuery Table Schema ---------------------------
    loadTableSchema() {

      let existingColumns = this.getAListOfExistingColumns();

      // If there are no existing fields, it means the table has not been created yet
      if( Object.keys(existingColumns).length == 0 ) {
        this.createDatasetIfItDoesntExist();
        existingColumns = this.createTableIfItDoesntExist();
      }

      this.existingColumns = existingColumns;

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

      for(var i in this.uniqueKeyColumns) {
        
        let columnName = this.uniqueKeyColumns[i];
        let columnType = 'string';
        let columnDescription = '';

        if( !(columnName in this.schema) ) {
          throw new Error(`Required field ${columnName} not found in schema`);
        }
        
        if( "GoogleBigQueryType" in this.schema[ columnName ] ) {
          columnType = this.schema[ columnName ]["GoogleBigQueryType"];
        }
        
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
        throw new Error(`To import data into Google BigQuery you need to add BigQuery Service first:
        Extension / Apps Script / Editor / Services / + BigQuery API`);
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
    addNewColumns(newColumns) {

      let query = '';
      let columns = [];

      // for each new column requested to be added to the table 
      for(var i in newColumns) {

        let columnName = newColumns[i];

        // checking the field is exists in schema
        if( columnName in this.schema ) {

          let columnType = 'STRING';
          let columnDescription = '';
          
          if( "GoogleBigQueryType" in this.schema[ columnName ] ) {
            columnType = this.schema[ columnName ]["GoogleBigQueryType"];
          }
          
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
        this.executeQuery(query);
        this.config.logMessage(`Columns '${newColumns.join(",")}' were added to ${this.config.DestinationDatasetID.value} table`);
      }




    }

  //---- saveData ----------------------------------------------------
    /**
     * Saving data to a storage
     * @param {data} array of assoc objects with records to save
     */
    saveData(data) {
           
      data.map((row) => {
      
        // if there are new columns in the first row it should be added first
        let newFields = Object.keys(row).filter( column => !Object.keys(this.existingColumns).includes(column) );
      
        if( newFields.length > 0 ) {
          console.log(newFields);
          this.addNewColumns(newFields);
        }
      
        this.addRecordToBuffer(row);
        this.saveRecordsAddedToBuffer(this.config.MaxBufferSize.value);

      })

      this.saveRecordsAddedToBuffer();
      
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
    saveRecordsAddedToBuffer(maxBufferSize = 0) {

      let bufferSize = Object.keys( this.updatedRecordsBuffer ).length;
    
      // buffer must be saved only in case if it is larger than maxBufferSize
      if( bufferSize && bufferSize >= maxBufferSize ) {

        let source = '';
        let rows = [];

        for(var key in this.updatedRecordsBuffer ) {

          let record = this.stringifyNeastedFields( this.updatedRecordsBuffer[key] );
          let fields = [];

          for(var i in this.existingColumns) {

            let columnName = this.existingColumns[i]["name"];
            let columnType = this.existingColumns[i]["type"];
            let columnValue = null;

            if( ( columnType.toUpperCase() == "DATE") && (record[ columnName ] instanceof Date) ) {

              columnValue = EnvironmentAdapter.formatDate( record[ columnName ], "UTC", "yyyy-MM-dd" );

            } else if( (columnType.toUpperCase() == "DATETIME") && (record[ columnName ] instanceof Date) ) {

              columnValue = EnvironmentAdapter.formatDate( record[ columnName ], "UTC", "yyyy-MM-dd HH:mm:ss" );

            } else {

              columnValue = this.obfuscateSpecialCharacters( record[ columnName ] );

            }
            
            
            fields.push(`SAFE_CAST("${columnValue}" AS ${columnType}) ${columnName}`);

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


        this.executeQuery(query);
        this.updatedRecordsBuffer = {};
    
      }
    

    }
 

  //---- query -------------------------------------------------------
    /**
     * Executes Google BigQuery Query and returns a result
     * 
     * @param {query} string 
     * 
     * @return object
     * 
     */
    executeQuery(query) {
      
      console.log(query);

      return BigQuery.Jobs.query(
          {"query": query,  useLegacySql: false}, 
          this.config.ProjectID.value
      );
    }

  //---- obfuscateSpecialCharacters ----------------------------------
    obfuscateSpecialCharacters(inputString) {
  
      return String(inputString).replace(/\\/g, '\\\\').replace(/\n/g, ' ').replace(/'/g, "\\'").replace(/"/g, '\\"'); 
  
    }

}