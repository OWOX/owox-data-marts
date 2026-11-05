import type { DuckDBConnection } from '@duckdb/node-api';
import { createHardenedInstance } from '../adapters/duckdb-api.adapter';
import { serializeDuckDbValue } from '../utils/duckdb-value.utils';

/** A DuckDB instance with the backend's production options, so tests refuse what production refuses. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createProductionDuckDbInstance(databasePath = ':memory:'): Promise<any> {
  return createHardenedInstance(databasePath);
}

/** Runs `sql` and returns its rows serialised the way the backend sends them. */
export async function readSerializedRows(
  connection: DuckDBConnection,
  sql: string
): Promise<Record<string, unknown>[]> {
  const reader = await connection.runAndReadAll(sql);
  return reader
    .getRowObjects()
    .map(row =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, serializeDuckDbValue(v)]))
    );
}
