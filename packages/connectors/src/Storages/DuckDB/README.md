# DuckDB Storage

Writes connector output into a local [DuckDB](https://duckdb.org) database file and
upserts by the node's `uniqueKeys`. Config: `DatabasePath`, `DestinationSchemaName`
(default `main`), `DestinationTableName` (default `Data`), `MaxBufferSize` (default `1000`).
Node only; uses `@duckdb/node-api` (lazy-loaded).
