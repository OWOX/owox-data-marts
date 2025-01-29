/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var GoogleSheetsStorage = class GoogleSheetsStorage extends AbstractStorage {
  //---- constructor -------------------------------------------------
    /**
     * Asbstract class making Google Sheets data active in Apps Script to simplity read/write operations
     * @param object {sheet} instance of Sheet
     * @param mixed {uniqueKeyColumns} a name of column with unique key or array with columns names
     */
    constructor(config, uniqueKeyColumns) {
    
      super(
        config.mergeParameters({
          CleanUpToKeepWindow: {
            requiredType: "number"
          },
          DestinationSheetName: {
            isRequired: true,
            default: "Data"
          }
        }),
        uniqueKeyColumns
      );
    
      this.SHEET = this.getDestinationSheet(config);
    
      this.loadDataFromSheet();
    
    }
    //----------------------------------------------------------------
  
  //---- loadDataFromSheet -------------------------------------------
    /**
     * reading Data from the source sheet and loading it to this.values
     */
    loadDataFromSheet() {
      
      const values = this.SHEET.getDataRange().getValues();
    
      // getting header with columns names
      this.columnNames = values.shift();
    
      // cheking if all columns from unique key are exist in this.columnNames
      if ( this.uniqueKeyColumns.some(column => !this.columnNames.includes(column)) ) {
        throw new Error(`Sheet '${this.SHEET.getName()}' is missing one the folling required for unique key: column '${this.uniqueKeyColumns}'`);
      }
    
      // Convert sheet data from array to an associative object using the unique key from the specified column
      this.values = values.reduce((acc, row, rowIndex) => {
      
        // create a unique Key
        const uniqueKey = this.uniqueKeyColumns.reduce((accumulator, columnName) => {
          let index = this.columnNames.indexOf(columnName); // Find the index of the column name
          accumulator += `|${row[index]}`;              // Append the corresponding value from the row
          return accumulator;
        },[]);
    
        acc[uniqueKey] = {
          ...this.columnNames.reduce((obj, col, colIndex) => ({
            ...obj,
            [col]: row[colIndex]
          }), {}),
          rowIndex // Add row index for reference
        };
    
        return acc;
      }, {});
    
      // property to buffer added record
      this.addedRecordsBuffer = [];
    
    }
    //----------------------------------------------------------------
  
  //---- getDestinationSheet -----------------------------------------
    /**
     * @param object destination Spreadsheet Config
     * @param object destination Sheet Name Config
     * @return Sheet object for data Destination
     */
    getDestinationSheet(config) {
    
      // reference to the destination sheet is not specified yet
      if( !this.SHEET ) {
      
        // destination sheet is a default one (the same as config's sheet)
        if( !config.DestinationSpreadsheet.value ) {
    
          config.DestinationSpreadsheet.spreadsheet = config.DestinationSpreadsheet.cell.getSheet().getParent();
    
        // destination spreadsheet is defined in config and must me used instead of config's sheet
        } else {
    
          let match = config.DestinationSpreadsheet.value.match(/\/d\/([a-zA-Z0-9-_]+)/);
    
          // Destination Spreadhseet is defined by its id
          if( match && match[1] ) {
    
            config.DestinationSpreadsheet.spreadhsheet = SpreadsheetApp.openById(match[1]);
    
          } else {
            
            let match = config.DestinationSpreadsheet.cell.getRichTextValue().getLinkUrl().match(/\/d\/([a-zA-Z0-9-_]+)/);
    
            if (match && match[1]) {
              config.DestinationSpreadsheet.spreadsheet = SpreadsheetApp.openById( match[1] );
            } else {
              throw new Error(`Destination Spreadsheet must be specified in config either by Spreadsheet Id or by a link to spreadsheet`);
            }
          }
        }
    
        // Try to get the sheet
        config.DestinationSpreadsheet.sheet = config.DestinationSpreadsheet.spreadsheet.getSheetByName( 
          config.DestinationSheetName.value
        ); 
    
        // if destination sheet doesn't exist in destination spreadsheet, try to create it
        if ( !config.DestinationSpreadsheet.sheet ) {
          config.DestinationSpreadsheet.sheet = config.DestinationSpreadsheet.spreadsheet.insertSheet( 
            config.DestinationSheetName.value,
            config.DestinationSpreadsheet.spreadsheet.getSheets().length
          );
          this.config.logMessage(`Sheet '${config.DestinationSheetName.value}' was created.`);
        }
    
        this.SHEET = config.DestinationSpreadsheet.sheet;
    
        // if sheet is blank, when header has to be added
        if( this.isEmpty() ) {
            this.addHeader( config.DestinationSpreadsheet.sheet, this.uniqueKeyColumns );
            this.config.logMessage(`Headers are added to '${config.DestinationSheetName.value}' sheet.`);
        }
    
      }
      
      return this.SHEET; // Return the sheet object
    
    }
    //----------------------------------------------------------------
  
  //---- addNewRecord ------------------------------------------------
    /**
     * Checking if record exists by id
     * @param object {record} object with record data
     * @param Boolean {useBuffer}: Set to `false` if the record must be saved instantly, or `true` to save it later using `this.saveAddedRecordsFromBuffer()`.
     * @return object {record} with added rowIndex property
     */
    addNewRecord(record, useBuffer = false) {
    
      let uniqueKey = this.getUniqueKeyByRecordFields( record );
    
      // a new record must be added to buffer
      if( useBuffer ) {
    
        this.addedRecordsBuffer[ uniqueKey ] = record;
    
      // a new record must be saved right away
      } else {
    
      // Filter data to include only existing columns
        let data = this.columnNames.map(key => record[key] || "");
        this.SHEET.appendRow(data);
        record.rowIndex = this.SHEET.getLastRow() - 2; // index start from the 1, and the first is a header
        this.values[ uniqueKey ] = record;
      }
    
      
    
      return record;
    
    }
    //----------------------------------------------------------------
  
  //---- saveData ----------------------------------------------------
    /**
     * Saving data to a storage
     * @param {data} array of assoc objects with records to save
     */
    saveData(data) {
      
      // updating sheet content based on data
      var recordsAdded = 0;
      var recordsUpdated = 0;
      
      data.map((row) => {
      
        // if there are new columns in the first row it should be added first
        let newFields = Object.keys(row).filter( column => !this.columnNames.includes(column) );
      
        // create new columns that are in data but absent in a Sheet
        for( var column in newFields ) {
          this.addColumn(newFields[column], this.columnNames.length + 1);
          this.config.logMessage(`Column '${newFields[column]}' was added to '${this.SHEET.getName()}' sheet`);
        }
      
        if( this.isRecordExists(row) ) {
          if( this.updateRecord(row) ) {
            recordsUpdated++;
          };
        } else {
          this.addNewRecord(row, true);
          recordsAdded += this.saveRecordsAddedToBuffer(100);
        }
      })
      
      // saving the residue of the buffer to sheet
      recordsAdded += this.saveRecordsAddedToBuffer(0);
      
      if( recordsAdded > 0) {
        this.config.logMessage(`${recordsAdded} records were added`);
      }
      
      if( recordsUpdated > 0) {
        this.config.logMessage(`${recordsUpdated} records were updated`);
      }
      
    }
    //----------------------------------------------------------------
  
  //---- saveRecordsAddedToBuffer ------------------------------------
    /**
     * Add records from buffer to a sheet
     * @param (integer) {maxBufferSize} record will be added only if buffer size if larger than this parameter
     */
    saveRecordsAddedToBuffer(maxBufferSize = 0)  {
    
      let recordsAdded = 0;
      let bufferSize = Object.keys( this.addedRecordsBuffer ).length;
    
      // buffer must be saved only in case if it is larger than maxBufferSize
      if( bufferSize && bufferSize >= maxBufferSize ) {
        
        let startIndex = this.SHEET.getLastRow() - 2;
        let index = 1;
        let data = [];
        for(var uniqueKey in this.addedRecordsBuffer) {
          let record = this.addedRecordsBuffer[uniqueKey];
          record.rowIndex = startIndex + index++;
          //console.log("rowIndex: " + record.rowIndex);
          this.values[ uniqueKey ] = record;
          data.push( this.columnNames.map(key => record[key] || "") );
        }
    
        this.SHEET.getRange(startIndex + 3, 1, data.length, data[0].length).setValues(data);
        recordsAdded = bufferSize;
        this.addedRecordsBuffer = {};
    
      }
    
      return recordsAdded;
    }
    //----------------------------------------------------------------
  
  //---- updateRecord ------------------------------------------------
    /**
     * Update content of an existing record
     * @param object {record} object with record data
     * @return boolean Returns true if the record was updated; otherwise, returns false
     */
    updateRecord(record) {
    
      let uniqueKey = this.getUniqueKeyByRecordFields( record );
    
      var existingRecord = this.getRecordByUniqueKey( uniqueKey );
      var isRecordUpdated = false;
    
      // Updating cells that have received new values
      this.columnNames.forEach((columnName, columnIndex) => {
    
        // if new record has a columnName property and a value of this property differs from an existingRecord one
        if( columnName in record && !this.areValuesEqual(record[ columnName ], existingRecord[ columnName ]) ) {
          //console.log(`${uniqueKey}: ${existingRecord[ columnName ]} ${typeof existingRecord[ columnName ]} → ${record[ columnName ]} ${typeof record[ columnName ]}`);
    
          // @TODO: before updating value we need to doublecheck that it is still the right record at this rowIndex
          
          this.SHEET.getRange(existingRecord.rowIndex + 2 , columnIndex + 1, 1, 1).setValue( record[ columnName ] );
          existingRecord[ columnName ] = record[ columnName ];
          isRecordUpdated = true;
        }
      });
      
      return isRecordUpdated;
    
    }
    //----------------------------------------------------------------
  
  //---- deleteRecord ------------------------------------------------
    /**
     * Delete record from a sheet
     * @param uniqueKey {string} unique key of the record to delete
     */
    deleteRecord(uniqueKey) {
    
    
      if( !(uniqueKey in this.values) ) {
        throw new Error(`Unable to delete the record with ID ${uniqueKey} because it was not found`);
    
      } else if( !("rowIndex" in this.values[ uniqueKey ])  ) {
        throw new Error(`Unable to delete the record with ID ${uniqueKey} because it does not have a rowIndex`);
        
      } else {
        let rowIndex = this.values[ uniqueKey ].rowIndex;
        this.SHEET.deleteRow(rowIndex + 2);
    
        // https://developers.google.com/apps-script/reference/spreadsheet/sheet#deleterowsrowposition,-howmany
        // if we deleting record we need to shift all records below one position up
        for(uniqueKey in this.values) {
          if( this.values[uniqueKey].rowIndex > rowIndex ) {
            this.values[uniqueKey].rowIndex--;
          }
        }
        
      }
    
    
    }
    //----------------------------------------------------------------
  
  //---- addHeader ---------------------------------------------------
    /**
     * Adding header to sheet
     * @param target Sheet
     * @param array column names to be added
     */
    addHeader(sheet, columnNames) {
      columnNames.forEach((columnName, index) => {
        sheet.insertColumns(index + 1);
        sheet.getRange(1, index + 1).setValue(columnName); 
      });
    
      sheet.getRange("1:1").setBackground("#f3f3f3").setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    
    }
    //----------------------------------------------------------------
  
  //---- addColumn ---------------------------------------------------
    /**
     * Adding a column to the sheet
     * @param columnName (string) column name
     * @param columnIndex (integer) optional; column index
     */
    addColumn(columnName, columnIndex = 1) {
    
      this.SHEET.insertColumnAfter(columnIndex-1);
      this.SHEET.getRange(1, columnIndex).setValue(columnName); 
      this.columnNames.push(columnName);
      
    }
    //----------------------------------------------------------------
  
  //---- getColumnIndexByName ----------------------------------------
    /**
     * @param columnName string column name
     * @return integer columnIndex
     */
    getColumnIndexByName(columnName) {
    
      const columnIndex = this.columnNames.indexOf(columnName);
    
      // column columnName is not found
      if( columnIndex == -1) {
        throw new Error(`Column ${columnName} not found in '${this.SHEET.getName()}' sheet`);
      }
    
      return columnIndex + 1;
    
    }
    //----------------------------------------------------------------
  
  //---- isEmpty -----------------------------------------------------
    /**
     * @return boolean true if sheet is empty, false overwise 
     */
    isEmpty() {
    
      return this.SHEET.getLastRow() === 0 && this.SHEET.getLastColumn() === 0;
    
    }
    //----------------------------------------------------------------
  
  //---- areValuesEqual ----------------------------------------------
    areValuesEqual(value1, value2) {
    
      var equal = null;
    
      if ( (typeof value1 !== "undefined" && typeof value2 !== "undefined")
      && ( value1.constructor.name == "Date" || value2.constructor.name == "Date" ) ) {
          
        const normalizeToDate = (value) => {
          if (value === null || value === "") return null;
          if (value.constructor.name == "Date") return value;
          const date = new Date(value);
          return isNaN(date.getTime()) ? null : date;
        };
    
        // Normalize inputs
        const date1 = normalizeToDate(value1);
        const date2 = normalizeToDate(value2);
    
        // Handle null or invalid dates
        if (date1 === null || date2 === null) {
          return value1 === value2; // Direct comparison for non-dates
        }
    
        // Compare timestamps
        equal = date1.getTime() === date2.getTime();
    
      } else if( typeof value1 == typeof value2) {
    
        equal = (value1 === value2)
    
      } else if( (value1 === undefined && value2 === "") || (value2 === undefined && value1 === "") ) {
    
        equal = true;
    
      } else if( (value1 === null && value2 === "") || (value2 === null && value1 === "") ) {
        
        equal = true;
    
      }
    
      return equal;
    
    }
    //----------------------------------------------------------------
}