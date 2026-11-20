import { Injectable, Logger } from '@nestjs/common';
import { SqlDryRunExecutor } from '../../interfaces/sql-dry-run-executor.interface';
import { SqlDryRunResult } from '../../../dto/domain/sql-dry-run-result.dto';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isDuckDbCredentials } from '../../data-storage-credentials.guards';
import { DuckDbApiAdapterFactory } from '../adapters/duckdb-api-adapter.factory';
import { DuckDbStorageBusyException } from '../utils/duckdb-lock-retry.utils';

/**
 * DuckDB implementation of {@link SqlDryRunExecutor}. Validates SQL via `EXPLAIN <sql>`
 * on a READ_ONLY connection — this parses and binds the statement (catching unknown
 * columns/tables/syntax errors) without materializing any rows.
 */
@Injectable()
export class DuckDbSqlDryRunExecutor implements SqlDryRunExecutor {
  readonly type = DataStorageType.DUCKDB;
  private readonly logger = new Logger(DuckDbSqlDryRunExecutor.name);

  constructor(private readonly adapterFactory: DuckDbApiAdapterFactory) {}

  async execute(
    credentials: DataStorageCredentials,
    _config: DataStorageConfig,
    sql: string
  ): Promise<SqlDryRunResult> {
    if (!isDuckDbCredentials(credentials)) throw new Error('DuckDB database path is not resolved');
    const adapter = this.adapterFactory.createForDatabasePath(credentials.databasePath);
    try {
      // EXPLAIN parses + binds the statement (catches unknown columns/tables/syntax) without materializing rows.
      await adapter.runStatement(`EXPLAIN ${sql ?? ''}`);
      return SqlDryRunResult.success();
    } catch (error) {
      // A busy storage is not a verdict on the SQL itself.
      if (error instanceof DuckDbStorageBusyException) throw error;
      this.logger.debug('DuckDB dry run failed', error);
      return SqlDryRunResult.failed(error instanceof Error ? error.message : String(error));
    } finally {
      await adapter.close();
    }
  }
}
