import { Injectable } from '@nestjs/common';
import {
  CreateViewExecutor,
  CreateViewResult,
} from '../../interfaces/create-view-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isDuckDbCredentials } from '../../data-storage-credentials.guards';
import { DuckDbApiAdapterFactory } from '../adapters/duckdb-api-adapter.factory';
import { escapeDuckDbIdentifier } from '../utils/duckdb-identifier.utils';

/**
 * DuckDB implementation for creating or replacing a view from a SQL query.
 *
 * Unlike the other storage types' create-view executors (which hold a
 * long-lived credentialed client), DuckDB is file-backed and single-writer:
 * this opens a *transient* READ_WRITE adapter just for the DDL statement and
 * always closes the adapter afterwards. Riding out a lock conflict with the
 * connector-runner child process (the writer during loads) is no longer this
 * executor's concern — {@link DuckDbApiAdapter.conn} retries the open itself
 * (via `withDuckDbLockRetry`), so every adapter open, this one included,
 * inherits the retry uniformly.
 */
@Injectable()
export class DuckDbCreateViewExecutor implements CreateViewExecutor {
  readonly type = DataStorageType.DUCKDB;

  constructor(private readonly adapterFactory: DuckDbApiAdapterFactory) {}

  async createView(
    credentials: DataStorageCredentials,
    _config: DataStorageConfig,
    viewName: string,
    sql: string
  ): Promise<CreateViewResult> {
    if (!isDuckDbCredentials(credentials)) throw new Error('DuckDB database path is not resolved');
    if (!viewName || !sql) throw new Error('View name and SQL must be provided');

    const ddl = `CREATE OR REPLACE VIEW ${escapeDuckDbIdentifier(viewName)} AS ${sql}`;

    const adapter = this.adapterFactory.createForDatabasePathReadWrite(credentials.databasePath);
    try {
      await adapter.runStatement(ddl);
    } finally {
      await adapter.close();
    }

    return { fullyQualifiedName: viewName };
  }
}
