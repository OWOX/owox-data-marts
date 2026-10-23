/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Storages/DuckDB/duckdbSql.js
//
// Pure SQL/type helpers for DuckDBStorage. No native deps, no Core globals —
// so this module is unit-testable directly and its `export`s are stripped when
// Vite concatenates it into the DuckDB storage IIFE.

export function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

const COLUMN_TYPES = {
  INTEGER: 'BIGINT',
  NUMBER: 'DOUBLE',
  BOOLEAN: 'BOOLEAN',
  DATE: 'DATE',
  DATETIME: 'TIMESTAMP',
  TIMESTAMP: 'TIMESTAMP',
  TIME: 'TIME',
  STRING: 'VARCHAR',
  ARRAY: 'VARCHAR',
  OBJECT: 'VARCHAR',
};

export function duckdbColumnType(genericType) {
  if (!genericType) return 'VARCHAR';
  const mapped = COLUMN_TYPES[genericType];
  if (!mapped) throw new Error('Unknown type: ' + genericType);
  return mapped;
}

const BIND_KINDS = {
  STRING: 'varchar',
  ARRAY: 'varchar',
  OBJECT: 'varchar',
  INTEGER: 'bigint',
  NUMBER: 'double',
  BOOLEAN: 'boolean',
  DATE: 'date',
  DATETIME: 'timestamp',
  TIMESTAMP: 'timestamp',
  TIME: 'time',
};

export function bindKind(genericType) {
  return BIND_KINDS[genericType] || 'varchar';
}

/**
 * Name a snapshot staging table so two runs against the same destination
 * cannot collide, and so an abandoned one is recognisable.
 */
export function createSnapshotStagingTableName(tableName) {
  const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${tableName}__owox_stage_${token}`;
}

function columnDefinitions(columns, columnTypes) {
  return columns.map(c => `${quoteIdent(c)} ${duckdbColumnType(columnTypes[c])}`).join(',\n  ');
}

// No PRIMARY KEY: it would pin the unique keys at creation and refuse a row with a NULL key.
export function buildCreateTableSql({ schema, table, columns, columnTypes }) {
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(schema)}.${quoteIdent(table)} (\n  ${columnDefinitions(columns, columnTypes)}\n)`;
}

// Append order, the staging table's last column: a node field named rowid would shadow DuckDB's.
const STAGING_SEQUENCE = '__owox_seq';

export function buildCreateStagingTableSql({ table, columns, columnTypes }) {
  return `CREATE OR REPLACE TEMP TABLE ${quoteIdent(table)} (\n  ${columnDefinitions(columns, columnTypes)},\n  ${quoteIdent(STAGING_SEQUENCE)} INTEGER\n)`;
}

export function buildAddColumnSql({ schema, table, column, columnType }) {
  return `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(table)} ADD COLUMN IF NOT EXISTS ${quoteIdent(column)} ${duckdbColumnType(columnType)}`;
}

export function buildMergeSql({ schema, table, staging, columns, uniqueKeys }) {
  const keySet = new Set(uniqueKeys);
  const src = c => `src.${quoteIdent(c)}`;
  // NULL-safe, so a rerun updates a row whose key is NULL instead of adding it again.
  const on = uniqueKeys
    .map(c => `dst.${quoteIdent(c)} IS NOT DISTINCT FROM ${src(c)}`)
    .join(' AND ');
  const nonKey = columns.filter(c => !keySet.has(c));
  const matched = nonKey.length
    ? `\nWHEN MATCHED THEN UPDATE SET ${nonKey.map(c => `${quoteIdent(c)} = ${src(c)}`).join(', ')}`
    : '';
  // Two staged rows can bind to one key ('01' and 1): keep the last, as a per-row upsert did.
  const lastPerKey = `SELECT * FROM ${quoteIdent(staging)} QUALIFY row_number() OVER (PARTITION BY ${uniqueKeys.map(quoteIdent).join(', ')} ORDER BY ${quoteIdent(STAGING_SEQUENCE)} DESC) = 1`;
  return (
    `MERGE INTO ${quoteIdent(schema)}.${quoteIdent(table)} AS dst\nUSING (${lastPerKey}) AS src\nON (${on})` +
    matched +
    `\nWHEN NOT MATCHED THEN INSERT (${columns.map(quoteIdent).join(', ')}) VALUES (${columns.map(src).join(', ')})`
  );
}

/**
 * DuckDB instance options that leave the rest of the host to the app and to
 * other loads: a quarter of the memory (at least 256 MB), half of the cores
 * and 10 GB of spill space.
 */
export function duckdbResourceLimits(totalMemoryBytes, cpuCount) {
  return {
    memory_limit: `${Math.max(256, Math.floor(totalMemoryBytes / 4 / 1e6))}MB`,
    threads: String(Math.max(1, Math.floor(cpuCount / 2))),
    max_temp_directory_size: '10GB',
  };
}
