// packages/connectors/tests/duckdbSql.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  quoteIdent,
  duckdbColumnType,
  bindKind,
  buildCreateTableSql,
  buildAddColumnSql,
  buildCreateStagingTableSql,
  buildMergeSql,
  duckdbResourceLimits,
} from '../src/Storages/DuckDB/duckdbSql.js';

test('quoteIdent wraps and escapes double-quotes', () => {
  assert.equal(quoteIdent('id'), '"id"');
  assert.equal(quoteIdent('we"ird'), '"we""ird"');
});

test('duckdbColumnType maps generic types to DuckDB types', () => {
  assert.equal(duckdbColumnType('INTEGER'), 'BIGINT');
  assert.equal(duckdbColumnType('NUMBER'), 'DOUBLE');
  assert.equal(duckdbColumnType('BOOLEAN'), 'BOOLEAN');
  assert.equal(duckdbColumnType('DATE'), 'DATE');
  assert.equal(duckdbColumnType('DATETIME'), 'TIMESTAMP');
  assert.equal(duckdbColumnType('TIMESTAMP'), 'TIMESTAMP');
  assert.equal(duckdbColumnType('TIME'), 'TIME');
  assert.equal(duckdbColumnType('STRING'), 'VARCHAR');
  assert.equal(duckdbColumnType('ARRAY'), 'VARCHAR');
  assert.equal(duckdbColumnType('OBJECT'), 'VARCHAR');
  assert.equal(duckdbColumnType(''), 'VARCHAR');
  assert.throws(() => duckdbColumnType('WAT'), /Unknown type: WAT/);
});

test('bindKind maps generic types to bind kinds', () => {
  assert.equal(bindKind('STRING'), 'varchar');
  assert.equal(bindKind('ARRAY'), 'varchar');
  assert.equal(bindKind('OBJECT'), 'varchar');
  assert.equal(bindKind('INTEGER'), 'bigint');
  assert.equal(bindKind('NUMBER'), 'double');
  assert.equal(bindKind('BOOLEAN'), 'boolean');
  assert.equal(bindKind('DATE'), 'date');
  assert.equal(bindKind('DATETIME'), 'timestamp');
  assert.equal(bindKind('TIMESTAMP'), 'timestamp');
  assert.equal(bindKind('TIME'), 'time');
});

test('buildCreateTableSql lists typed columns without a primary key', () => {
  const sql = buildCreateTableSql({
    schema: 'main',
    table: 'Data',
    columns: ['id', 'name'],
    columnTypes: { id: 'INTEGER', name: 'STRING' },
  });
  assert.equal(
    sql,
    'CREATE TABLE IF NOT EXISTS "main"."Data" (\n  "id" BIGINT,\n  "name" VARCHAR\n)'
  );
});

test('buildCreateStagingTableSql creates a typed TEMP table with a row sequence, VARCHAR for an untyped column', () => {
  const sql = buildCreateStagingTableSql({
    table: 'stage',
    columns: ['id', 'extra'],
    columnTypes: { id: 'INTEGER' },
  });
  assert.equal(
    sql,
    'CREATE OR REPLACE TEMP TABLE "stage" (\n  "id" BIGINT,\n  "extra" VARCHAR,\n  "__owox_seq" INTEGER\n)'
  );
});

test('buildAddColumnSql adds one typed column', () => {
  const sql = buildAddColumnSql({
    schema: 'main',
    table: 'Data',
    column: 'extra',
    columnType: 'NUMBER',
  });
  assert.equal(sql, 'ALTER TABLE "main"."Data" ADD COLUMN IF NOT EXISTS "extra" DOUBLE');
});

test('buildMergeSql updates matched rows by every unique key and inserts the rest', () => {
  const sql = buildMergeSql({
    schema: 'main',
    table: 'Data',
    staging: 'stage',
    columns: ['id', 'day', 'name'],
    uniqueKeys: ['id', 'day'],
  });
  assert.equal(
    sql,
    'MERGE INTO "main"."Data" AS dst\n' +
      'USING (SELECT * FROM "stage" QUALIFY row_number() OVER (PARTITION BY "id", "day" ORDER BY "__owox_seq" DESC) = 1) AS src\n' +
      'ON (dst."id" IS NOT DISTINCT FROM src."id" AND dst."day" IS NOT DISTINCT FROM src."day")\n' +
      'WHEN MATCHED THEN UPDATE SET "name" = src."name"\n' +
      'WHEN NOT MATCHED THEN INSERT ("id", "day", "name") VALUES (src."id", src."day", src."name")'
  );
});

test('buildMergeSql with only key columns only inserts', () => {
  const sql = buildMergeSql({
    schema: 'main',
    table: 'Data',
    staging: 'stage',
    columns: ['id'],
    uniqueKeys: ['id'],
  });
  assert.doesNotMatch(sql, /WHEN MATCHED/);
  assert.match(sql, /WHEN NOT MATCHED THEN INSERT \("id"\) VALUES \(src\."id"\)$/);
});

test('duckdbResourceLimits takes a quarter of the memory, half of the cores and 10GB of spill', () => {
  assert.deepEqual(duckdbResourceLimits(16e9, 8), {
    memory_limit: '4000MB',
    threads: '4',
    max_temp_directory_size: '10GB',
  });
  assert.deepEqual(duckdbResourceLimits(512e6, 1), {
    memory_limit: '256MB',
    threads: '1',
    max_temp_directory_size: '10GB',
  });
});
