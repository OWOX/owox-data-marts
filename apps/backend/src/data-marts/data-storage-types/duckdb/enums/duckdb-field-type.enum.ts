// DuckDB column-type vocabulary (matches the connector-side duckdbSql.js type map).
export enum DuckdbFieldType {
  BIGINT = 'BIGINT',
  DOUBLE = 'DOUBLE',
  BOOLEAN = 'BOOLEAN',
  DATE = 'DATE',
  TIMESTAMP = 'TIMESTAMP',
  TIMESTAMPTZ = 'TIMESTAMPTZ',
  TIME = 'TIME',
  VARCHAR = 'VARCHAR',
}
