/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { LOG_LEVEL, PARAMETER_OWNER } from '../Constants/CommonConstants.js';

/**
 * AbstractStorage — base class for data storage backends.
 *
 * Subclasses MUST:
 * 1. Declare a `static parameters = { ... }` object listing their config parameters
 *    (e.g., `Project`, `Dataset`, etc. for BigQuery)
 * 2. Implement `init()` and `saveData(data)`
 * 3. Implement `getColumnType(columnName)`
 *
 * The constructor automatically calls `context.registerParameters(static parameters, 'storage')`
 * so storage-side config defaults land in `context.storageConfig`.
 */
export class AbstractStorage {
  //---- constructor -------------------------------------------------
  /**
   * Abstract class for storage operations providing common methods for data persistence
   * @param context (object) instance of AbstractContext
   * @param uniqueKeyColumns (mixed) a name of column with unique key or array with columns names
   * @param schema (object) object with structure like {fieldName: {type: "number", description: "smth" } }
   * @param description (string) string with storage description }
   */
  constructor(context, uniqueKeyColumns, schema = null, description = null) {
    if (!context) throw new Error('context is required');

    this.context = context;
    this.context.registerParameters(this.constructor.parameters || {}, PARAMETER_OWNER.STORAGE);

    this.schema = schema;
    this.description = description;
    this.columnNames = [];
    this.values = {};

    if (typeof uniqueKeyColumns === 'string') {
      this.uniqueKeyColumns = [uniqueKeyColumns];
    } else if (Array.isArray(uniqueKeyColumns)) {
      this.uniqueKeyColumns = uniqueKeyColumns;
    } else if (typeof uniqueKeyColumns === 'object' && uniqueKeyColumns !== null) {
      this.uniqueKeyColumns = uniqueKeyColumns;
    }

    if (!this.uniqueKeyColumns || !this.uniqueKeyColumns.length) {
      throw new Error(
        'Cannot create instance of AbstractStorage object because uniqueKeyColumns are not defined'
      );
    }
  }
  //----------------------------------------------------------------

  //---- init --------------------------------------------------------
  /**
   * Initializing storage
   */
  async init() {
    throw new Error('Method init() has to be implemented in a child class of AbstractStorage');
  }
  //----------------------------------------------------------------
  //---- getUniqueKeyByRecordFields ----------------------------------
  /**
   * Calculcating unique key based on this.uniqueKeyColumns
   * @param {*} record
   * @param object
   */
  getUniqueKeyByRecordFields(record) {
    return this.uniqueKeyColumns.reduce((accumulator, columnName) => {
      if (!(columnName in record)) {
        throw Error(
          `'${columnName}' value is required for Unique Key, but it is missing in a record`
        );
      }

      let value = record[columnName];

      if (
        typeof value === 'object' &&
        value !== null &&
        !(value instanceof Date) &&
        !(value.constructor.name == 'Date')
      ) {
        value = JSON.stringify(value);
      }

      accumulator += `|${value}`;
      return accumulator;
    }, []);
  }
  //----------------------------------------------------------------

  //---- getRecordByUniqueKey ----------------------------------------
  /**
   * Returning specific row data by unique id
   * @param string {key} unique id of the record
   * @return object with row data
   */
  getRecordByUniqueKey(key) {
    return typeof this.values[key] == 'object' ? this.values[key] : null;
  }
  //----------------------------------------------------------------

  //---- getRecordByRecordFields -------------------------------------
  /**
   * @param object with record values
   * @return object that might have additional information
   */
  getRecordByRecordFields(fields) {
    var record = null;
    var uniqueKey = null;

    if ((uniqueKey = this.getUniqueKeyByRecordFields(fields))) {
      record = this.getRecordByUniqueKey(uniqueKey);
    }

    return record;
  }
  //----------------------------------------------------------------

  //---- isRecordExists ----------------------------------------------
  /**
   * Checking if record exists by id
   * @param object {record}  record
   * @return TRUE if record exists, overwise FALSE
   */
  isRecordExists(record) {
    return this.getUniqueKeyByRecordFields(record) in this.values;
  }
  //----------------------------------------------------------------

  //---- saveData ----------------------------------------------------
  /**
   * Saving data to a storage. Has to be implemented in child class as async method.
   * @param {data} array of assoc objects with records to save
   * @returns {Promise<void>}
   */
  async saveData(data) {
    throw new Error('Method saveData() has to be implemented in a child class of AbstractStorage');
  }
  //----------------------------------------------------------------

  //---- replaceData -------------------------------------------------
  /**
   * Replace all data and schema in the destination table.
   * Full-refresh sources use this when removed source rows and columns must
   * also be removed from storage.
   * @param {data} array of assoc objects with records to save
   * @returns {Promise<void>}
   */
  async replaceData(data) {
    throw new Error(`${this.constructor.name} does not support full-refresh table replacement`);
  }
  //----------------------------------------------------------------

  //---- hasSameSchema -----------------------------------------------
  /**
   * Compare two column maps by name set and type. Callers pass columns in
   * whichever shape their backend reports them — a bare type string or a
   * `{type}` object — so both are accepted on either side.
   * @param {object} actualColumns columns currently in the live table
   * @param {object} expectedColumns columns the staged table would publish
   * @param {function} normalizeType folds backend type aliases onto one name
   * @returns {boolean} TRUE when the schemas are equivalent
   */
  hasSameSchema(
    actualColumns,
    expectedColumns,
    normalizeType = type => String(type).toUpperCase()
  ) {
    const actualNames = Object.keys(actualColumns || {});
    const expectedNames = Object.keys(expectedColumns || {});
    if (actualNames.length !== expectedNames.length) {
      return false;
    }

    return expectedNames.every(name => {
      if (!(name in actualColumns)) {
        return false;
      }

      const actualColumn = actualColumns[name];
      const expectedColumn = expectedColumns[name];
      const actualType = typeof actualColumn === 'string' ? actualColumn : actualColumn?.type;
      const expectedType =
        typeof expectedColumn === 'string' ? expectedColumn : expectedColumn?.type;

      return normalizeType(actualType) === normalizeType(expectedType);
    });
  }
  //----------------------------------------------------------------

  //---- saveRecordsAddedToBuffer ------------------------------------
  /**
   * Add records from buffer to a sheet
   * @param (integer) {maxBufferSize} record will be added only if buffer size if larger than this parameter
   */
  saveRecordsAddedToBuffer(maxBufferSize = 0) {
    throw new Error('saveRecordsAddedToBuffer() must be implemented in AbsctractStorage subclasse');
  }
  //----------------------------------------------------------------

  //---- cleanUpExpiredData ------------------------------------------
  /**
   * Delete all rows from storage which have a dateColumn before today() - CleanUpToKeepWindow
   * @param string date field
   */
  cleanUpExpiredData(dateColumn) {
    try {
      // cheking if date column exists in this.columnNames
      if (this.uniqueKeyColumns.some(column => !this.columnNames.includes(dateColumn))) {
        throw new Error(
          `Cannot clean up expired data because the column '${dateColumn}' is missing in the data storage`
        );

        // start cleaning process
      } else {
        this.context.log(LOG_LEVEL.INFO, `Start cleaning expired rows`);

        let deletedRows = 0;
        let maxDate = new Date();

        const keepWindowParam = this.context.getParameter('CleanUpToKeepWindow');
        const keepWindow = keepWindowParam?.value ?? 0;
        maxDate.setDate(maxDate.getDate() - keepWindow);

        for (var uniqueKey in this.values) {
          let record = this.values[uniqueKey];

          // record date is expired
          if (record[dateColumn] < maxDate) {
            this.deleteRecord(uniqueKey);
            deletedRows++;
          }
        }

        switch (deletedRows) {
          case 0:
            this.context.log(LOG_LEVEL.INFO, `No rows were deleted`);
            break;

          case 1:
            this.context.log(LOG_LEVEL.INFO, `1 row was deleted`);
            break;

          default:
            this.context.log(LOG_LEVEL.INFO, `${deletedRows} row were deleted`);
            break;
        }
      }

      this.context.log(LOG_LEVEL.INFO, 'Cleanup is finished');
    } catch (error) {
      this.context.log(LOG_LEVEL.INFO, `${error.message}`);
      throw error;
    }
  }

  //---- stringifyNeastedFields --------------------------------------
  /**
   * Because Google SHeets can store only flat structure, cast JSON fields to string format
   * @param record (object) object with row data to cast
   * @return record (object) object with casted fields
   */
  stringifyNeastedFields(record) {
    for (var field in record) {
      if (
        typeof record[field] == 'object' &&
        record[field] !== null &&
        !(record[field] instanceof Date) &&
        !(record[field].constructor.name == 'Date')
      ) {
        record[field] = JSON.stringify(record[field]);
      }
    }

    return record;
  }
  //----------------------------------------------------------------

  //---- getSelectedFields -------------------------------------------
  /**
   * Parse Fields config value and return array of selected field names
   * @returns {Array<string>} Array of selected field names
   */
  getSelectedFields() {
    const fieldsParam = this.context.getParameter('Fields');
    if (!fieldsParam || !fieldsParam.value) {
      return [];
    }

    return fieldsParam.value
      .split(',')
      .map(field => field.trim())
      .filter(field => field !== '')
      .map(field => field.split(' '))
      .filter(field => field.length === 2)
      .map(field => field[1]);
  }
  //----------------------------------------------------------------

  //---- getColumnType -----------------------------------------------
  /**
   * Get column type for storage from schema
   * @param {string} columnName - Name of the column
   * @returns {string} Storage-specific column type
   */
  getColumnType(columnName) {
    throw new Error(
      'Method getColumnType() has to be implemented in a child class of AbstractStorage'
    );
  }
  //----------------------------------------------------------------

  //---- _reportRowsWritten -----------------------------------------
  /**
   * Emit a `rows_written` analytics metric for a batch just written to storage.
   * Incremental (the host sums these into a live loading total). Node identity
   * is the destination table, read uniformly across every storage backend.
   * No-op for non-positive counts.
   * @param {number} count rows written in this batch
   */
  _reportRowsWritten(count) {
    if (!count || count <= 0) return;
    this.context.emitAnalytics('rows_written', count, { node: this._getReportingTableName() });
  }
  //----------------------------------------------------------------

  //---- _getReportingTableName -------------------------------------
  /**
   * The table analytics should attribute rows to. Full-refresh publication
   * repoints DestinationTableName at a staging table so the existing write
   * path loads into it; rows written during that window still belong to the
   * table the user configured, not to the throwaway staging name.
   * @returns {string|null}
   */
  _getReportingTableName() {
    return (
      this._snapshotLiveTableName ??
      this.context.getParameter('DestinationTableName')?.value ??
      null
    );
  }
  //----------------------------------------------------------------
}
