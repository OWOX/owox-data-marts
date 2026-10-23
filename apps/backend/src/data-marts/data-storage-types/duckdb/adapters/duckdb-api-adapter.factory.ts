import { Injectable } from '@nestjs/common';
import { DuckDbApiAdapter } from './duckdb-api.adapter';

/**
 * Factory for creating {@link DuckDbApiAdapter} instances bound to a specific
 * database file path. Each adapter owns its own connection and must be
 * closed by the caller.
 */
@Injectable()
export class DuckDbApiAdapterFactory {
  createForDatabasePath(databasePath: string): DuckDbApiAdapter {
    return new DuckDbApiAdapter(databasePath);
  }

  /**
   * Opens the database file READ_WRITE. Used for transient DDL/DML (e.g. create-view);
   * DuckDB is single-writer-per-file, so a concurrent open (by, e.g., the connector-runner
   * child process during a load) can conflict — {@link DuckDbApiAdapter.conn} retries that
   * automatically, so callers just need to always `close()` the adapter when done.
   */
  createForDatabasePathReadWrite(databasePath: string): DuckDbApiAdapter {
    return new DuckDbApiAdapter(databasePath, 'READ_WRITE');
  }
}
