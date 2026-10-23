/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// duckdbSql helpers (buildCreateTableSql, buildCreateStagingTableSql, buildAddColumnSql,
// buildMergeSql, duckdbColumnType, bindKind, quoteIdent, duckdbResourceLimits) are concatenated into this same IIFE
// by the Vite bundler; `LOG_LEVEL`, `DATA_TYPES`, `AbstractStorage`, `FieldCaster` are Core globals.

var DuckDBStorage = class DuckDBStorage extends AbstractStorage {
  static parameters = {
    DatabasePath: { isRequired: true, requiredType: 'string' },
    DestinationSchemaName: { isRequired: true, default: 'main' },
    DestinationTableName: { isRequired: true, default: 'Data' },
    MaxBufferSize: { isRequired: true, default: 1000 },
  };

  constructor(context, uniqueKeyColumns, schema = null, description = null) {
    super(context, uniqueKeyColumns, schema, description);
    this.updatedRecordsBuffer = new Map();
    this.totalRecordsProcessed = 0;
    this._db = null;
    this._conn = null;
    this._duck = null;
    this.existingColumns = {};
  }

  _schemaName() {
    return this.context.getParameter('DestinationSchemaName')?.value || 'main';
  }
  _tableName() {
    return this.context.getParameter('DestinationTableName')?.value || 'Data';
  }

  getColumnType(columnName) {
    return duckdbColumnType(this.schema[columnName]['type']);
  }

  /**
   * Open the database and ensure the destination schema exists.
   * Separate from init() because replaceData() needs a connection without
   * init()'s table creation — a snapshot builds its own staging table.
   */
  async _openDatabase() {
    if (this._conn) return;
    // Lazy require — external to the Vite bundle, resolved at runtime.
    this._duck = this._duck || require('@duckdb/node-api');
    const sleep = this._sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const dbPath = this.context.getParameter('DatabasePath')?.value;
    const os = require('node:os');
    const memory = Math.min(os.totalmem(), process.constrainedMemory() || Infinity);
    const limits = duckdbResourceLimits(memory, os.availableParallelism());
    require('node:fs').mkdirSync(require('node:path').dirname(dbPath), { recursive: true });
    // Same lock-wait schedule as the backend: 13 attempts, 100 ms doubling, capped at 4000 ms.
    let db;
    for (let attempt = 0; ; attempt++) {
      try {
        db = await this._duck.DuckDBInstance.create(dbPath, limits);
        break;
      } catch (error) {
        const isLock = /\block\b|being used by another/i.test(String(error?.message ?? error));
        if (!isLock || attempt >= 12) throw error;
        await sleep(Math.min(100 * 2 ** attempt, 4000));
      }
    }
    let conn;
    try {
      conn = await db.connect();
      // UTC as in the backend; create() does not accept TimeZone, and a locked config refuses SET.
      await conn.run(`SET GLOBAL TimeZone = 'UTC'`);
      await conn.run('SET GLOBAL lock_configuration = true');
    } catch (error) {
      conn?.closeSync();
      db.closeSync();
      throw error;
    }
    this._db = db;
    this._conn = conn;
    await this._conn.run(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(this._schemaName())}`);
  }

  async init() {
    await this._openDatabase();

    const schema = this._schemaName();
    const table = this._tableName();

    this.existingColumns = await this._loadExistingColumns(schema, table);
    if (Object.keys(this.existingColumns).length === 0) {
      await this._createTable(schema, table);
    } else {
      const selected = this.getSelectedFields();
      const missing = selected.filter(c => !(c in this.existingColumns));
      if (missing.length) await this._addColumns(schema, table, missing);
    }
  }

  async _loadExistingColumns(schema, table) {
    const esc = s => String(s).replace(/'/g, "''");
    const sql = `SELECT column_name FROM information_schema.columns WHERE table_schema = '${esc(schema)}' AND table_name = '${esc(table)}'`;
    const reader = await this._conn.runAndReadAll(sql);
    const cols = {};
    for (const row of reader.getRowObjects()) cols[String(row.column_name)] = true;
    return cols;
  }

  async _createTable(schema, table) {
    const selected = this.getSelectedFields();
    const columns = selected.length ? selected : this.uniqueKeyColumns;
    const columnTypes = {};
    for (const c of columns) {
      if (!(c in this.schema)) throw new Error(`Required field ${c} not found in schema`);
      columnTypes[c] = this.schema[c]['type'];
      this.existingColumns[c] = true;
    }
    await this._conn.run(
      buildCreateTableSql({
        schema,
        table,
        columns,
        columnTypes,
      })
    );
    this.context.log(LOG_LEVEL.INFO, `DuckDB table ${schema}.${table} was created`);
  }

  async _addColumns(schema, table, columns) {
    for (const c of columns) {
      if (!(c in this.schema)) continue;
      await this._conn.run(
        buildAddColumnSql({ schema, table, column: c, columnType: this.schema[c]['type'] })
      );
      this.existingColumns[c] = true;
    }
  }

  async saveData(data) {
    const maxBufferSize = this.context.getParameter('MaxBufferSize')?.value || 1000;
    for (const row of data) {
      const newFields = Object.keys(row).filter(c => !(c in this.existingColumns));
      if (newFields.length)
        await this._addColumns(this._schemaName(), this._tableName(), newFields);
      this.addRecordToBuffer(row);
      await this.saveRecordsAddedToBuffer(maxBufferSize);
    }
    await this.saveRecordsAddedToBuffer();
    // The run never closes the file, so without this committed rows stay in the .wal only.
    await this._conn.run('CHECKPOINT');
  }

  /**
   * Publish a full-refresh snapshot: load every row into a staging table,
   * validate it, then swap it over the live table.
   *
   * DuckDB has transactional DDL, so the swap is a single transaction rather
   * than the rename dance the warehouse backends need — nothing else can
   * observe the table between the drop and the rename.
   *
   * @param {Array<object>} data - records to publish
   * @returns {Promise<void>}
   */
  async replaceData(data) {
    await this._openDatabase();

    const destinationTableParam = this.context.getParameter('DestinationTableName');
    const schema = this._schemaName();
    const liveTableName = this._tableName();
    const stagingTableName = createSnapshotStagingTableName(liveTableName);
    const originalExistingColumns = this.existingColumns;
    let stagingCreated = false;
    let published = false;

    try {
      // The write path reads the destination from config, so staging is entered
      // by repointing that parameter. _snapshotLiveTableName keeps analytics
      // attributed to the configured table while the swap is in flight.
      this._snapshotLiveTableName = liveTableName;
      if (destinationTableParam) destinationTableParam.value = stagingTableName;
      this.existingColumns = {};
      this.updatedRecordsBuffer = new Map();

      await this._createTable(schema, stagingTableName);
      stagingCreated = true;

      if (data.length) {
        await this.saveData(data);
      }

      // Rows sharing a unique key collapse on upsert, so the expectation is the
      // count of distinct keys — not data.length, which would fail a legitimate
      // load that happened to carry a duplicate.
      const expectedRowCount = new Set(
        data.map(row => String(this.getUniqueKeyByRecordFields(row)))
      ).size;
      await this._validateSnapshotRowCount(schema, stagingTableName, expectedRowCount);

      if (destinationTableParam) destinationTableParam.value = liveTableName;

      await this._conn.run('BEGIN TRANSACTION');
      try {
        await this._conn.run(
          `DROP TABLE IF EXISTS ${quoteIdent(schema)}.${quoteIdent(liveTableName)}`
        );
        await this._conn.run(
          `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(stagingTableName)} RENAME TO ${quoteIdent(liveTableName)}`
        );
        await this._conn.run('COMMIT');
      } catch (swapError) {
        // A failed COMMIT has already ended the transaction; its error is the one to report.
        await this._conn.run('ROLLBACK').catch(() => {});
        throw swapError;
      }
      stagingCreated = false;
      published = true;
      await this._conn.run('CHECKPOINT');

      this.context.log(
        LOG_LEVEL.INFO,
        `Snapshot import completed for ${schema}.${liveTableName}: ${data.length} rows`
      );
    } finally {
      if (destinationTableParam) destinationTableParam.value = liveTableName;
      this._snapshotLiveTableName = null;
      this.updatedRecordsBuffer = new Map();
      if (!published) {
        this.existingColumns = originalExistingColumns;
      }

      if (stagingCreated) {
        try {
          await this._conn.run(
            `DROP TABLE IF EXISTS ${quoteIdent(schema)}.${quoteIdent(stagingTableName)}`
          );
        } catch (cleanupError) {
          this.context.log(
            LOG_LEVEL.WARN,
            `Failed to clean up snapshot staging table ${stagingTableName}: ${cleanupError.message}`
          );
        }
      }
    }
  }

  /**
   * Refuse to publish a staging table whose row count does not match what we
   * set out to write — a short load must never silently truncate the live table.
   */
  async _validateSnapshotRowCount(schema, table, expectedRowCount) {
    const reader = await this._conn.runAndReadAll(
      `SELECT COUNT(*) AS row_count FROM ${quoteIdent(schema)}.${quoteIdent(table)}`
    );
    const rows = reader.getRowObjects();
    const actualRowCount = rows.length ? Number(rows[0].row_count) : NaN;

    if (!Number.isSafeInteger(actualRowCount) || actualRowCount !== expectedRowCount) {
      const actual = Number.isSafeInteger(actualRowCount) ? actualRowCount : 'unknown';
      throw new Error(
        `Snapshot staging row count mismatch for ${schema}.${table}: expected ${expectedRowCount}, got ${actual}`
      );
    }

    return actualRowCount;
  }

  addRecordToBuffer(record) {
    this.updatedRecordsBuffer.set(this.getUniqueKeyByRecordFields(record), record);
  }

  // Called once per row: a Map's size keeps that check O(1).
  async saveRecordsAddedToBuffer(maxBufferSize = 0) {
    const size = this.updatedRecordsBuffer.size;
    if (size && size >= maxBufferSize) {
      await this._flush([...this.updatedRecordsBuffer.values()]);
      this.updatedRecordsBuffer = new Map();
    }
  }

  async _flush(records) {
    const schema = this._schemaName();
    const table = this._tableName();
    const staging = '__owox_merge_stage';
    const columns = Object.keys(this.existingColumns);
    const columnTypes = {};
    for (const c of columns) columnTypes[c] = this.schema[c]?.['type'];

    await this._conn.run('BEGIN TRANSACTION');
    try {
      await this._conn.run(buildCreateStagingTableSql({ table: staging, columns, columnTypes }));
      const appender = await this._conn.createAppender(staging, null, 'temp');
      try {
        records.forEach((record, seq) => this._appendRow(appender, columns, record, seq));
      } finally {
        // After a half-appended row this discards the batch without throwing; the catch rolls back.
        appender.closeSync();
      }
      await this._conn.run(
        buildMergeSql({ schema, table, staging, columns, uniqueKeys: this.uniqueKeyColumns })
      );
      await this._conn.run(`DROP TABLE ${quoteIdent(staging)}`);
      await this._conn.run('COMMIT');
    } catch (e) {
      await this._conn.run('ROLLBACK').catch(() => {});
      throw e;
    }

    this.totalRecordsProcessed += records.length;
    this.context.log(
      LOG_LEVEL.INFO,
      `DuckDB upsert completed for ${records.length} records (Total processed: ${this.totalRecordsProcessed})`
    );
    this._reportRowsWritten(records.length);
  }

  // ---- temporal part builders --------------------------------------
  // The real @duckdb/node-api factories (confirmed against the installed
  // package's .d.ts) take a SINGLE "parts" object, not positional
  // (year, month, day, ...) arguments:
  //   dateValue({ year, month, day })
  //   timestampValue({ date: { year, month, day }, time: { hour, min, sec, micros } })
  //   timeValue({ hour, min, sec, micros })
  _dateParts(d) {
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  _timeParts(d) {
    return {
      hour: d.getUTCHours(),
      min: d.getUTCMinutes(),
      sec: d.getUTCSeconds(),
      micros: d.getUTCMilliseconds() * 1000,
    };
  }

  // Accepts a Date, or a "HH:MM:SS[.ffffff]" string (TIME has no calendar
  // date, so a bare string is the common shape coming out of connectors).
  _timePartsFromValue(v) {
    if (v instanceof Date) return this._timeParts(v);
    const match = String(v).match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
    if (!match) throw new Error(`DuckDBStorage: cannot parse TIME value "${v}"`);
    const [, h, m, s, frac] = match;
    const micros = frac ? Math.round(Number(`0.${frac}`) * 1e6) : 0;
    return { hour: Number(h), min: Number(m), sec: Number(s), micros };
  }

  _appendRow(appender, columns, record, seq) {
    const values = [];
    const types = [];
    const T = this._duck;
    columns.forEach((col, i) => {
      const kind = bindKind(this.schema[col] ? this.schema[col]['type'] : DATA_TYPES.STRING);
      const v = record[col];
      types[i] = this._duckTypeFor(kind);
      if (v === undefined || v === null || (v instanceof Date && Number.isNaN(v.getTime()))) {
        values[i] = null;
        return;
      }
      switch (kind) {
        case 'bigint': {
          // Number() would round an integer string beyond 2^53.
          const exact = typeof v === 'string' && /^-?\d+$/.test(v);
          const n = exact ? BigInt(v) : Math.trunc(Number(v));
          // Guard non-numeric input: Number('N/A') → NaN and BigInt(NaN)
          // throws, which would abort the entire account/batch. Degrade a
          // garbage integer to NULL instead of crashing.
          if (!exact && !Number.isFinite(n)) {
            values[i] = null;
            break;
          }
          const big = BigInt(n);
          if (BigInt.asIntN(64, big) !== big) {
            throw new Error(
              `DuckDBStorage: INTEGER value "${v}" in column "${col}" is outside the BIGINT range`
            );
          }
          values[i] = big;
          break;
        }
        case 'double': {
          const n = Number(v);
          values[i] = Number.isFinite(n) ? n : null;
          break;
        }
        case 'boolean':
          // Mirror AbstractContext's own string->boolean convention ('true'/'false',
          // case-insensitive) so a stringified boolean ('false') doesn't coerce to
          // truthy via a bare Boolean(v) cast.
          values[i] = typeof v === 'string' ? v.toLowerCase() === 'true' : Boolean(v);
          break;
        case 'date': {
          // The engine's reading: a string without a zone is that wall-clock in UTC on any host.
          const d = FieldCaster.toDate(v);
          values[i] = d ? T.dateValue(this._dateParts(d)) : null;
          break;
        }
        case 'timestamp': {
          const d = FieldCaster.toDate(v);
          values[i] = d
            ? T.timestampValue({ date: this._dateParts(d), time: this._timeParts(d) })
            : null;
          break;
        }
        case 'time':
          values[i] = T.timeValue(this._timePartsFromValue(v));
          break;
        default: // varchar (incl. ARRAY/OBJECT serialized to JSON text)
          values[i] =
            v instanceof Date
              ? v.toISOString()
              : typeof v === 'object'
                ? JSON.stringify(v)
                : String(v);
      }
    });
    values.forEach((v, i) => appender.appendValue(v, types[i]));
    appender.appendInteger(seq);
    appender.endRow();
  }

  _duckTypeFor(kind) {
    const T = this._duck;
    switch (kind) {
      case 'bigint':
        return T.BIGINT;
      case 'double':
        return T.DOUBLE;
      case 'boolean':
        return T.BOOLEAN;
      case 'date':
        return T.DATE;
      case 'timestamp':
        return T.TIMESTAMP;
      case 'time':
        return T.TIME;
      default:
        return T.VARCHAR;
    }
  }
};
