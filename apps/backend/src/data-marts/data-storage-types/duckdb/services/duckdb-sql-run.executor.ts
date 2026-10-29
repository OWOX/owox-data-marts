import { Injectable } from '@nestjs/common';
import { SqlRunExecutor } from '../../interfaces/sql-run-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { SqlRunBatch } from '../../../dto/domain/sql-run-batch.dto';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { isQueryBuildResult } from '../../interfaces/data-mart-query-builder.interface';
import { isDuckDbCredentials } from '../../data-storage-credentials.guards';
import { DuckDbApiAdapterFactory } from '../adapters/duckdb-api-adapter.factory';
import { DuckDbQueryBuilder } from './duckdb-query.builder';
import { serializeDuckDbValue } from '../utils/duckdb-value.utils';

/** Streams the whole result within one `execute()` call, so every batch's `nextBatchId` is null. */
@Injectable()
export class DuckDbSqlRunExecutor implements SqlRunExecutor {
  readonly type = DataStorageType.DUCKDB;

  constructor(
    private readonly adapterFactory: DuckDbApiAdapterFactory,
    private readonly queryBuilder: DuckDbQueryBuilder
  ) {}

  async *execute<Row = Record<string, unknown>>(
    credentials: DataStorageCredentials,
    _config: DataStorageConfig,
    definition: DataMartDefinition,
    sql: string | undefined,
    options?: { maxRowsPerBatch?: number }
  ): AsyncGenerator<SqlRunBatch<Row>> {
    if (!isDuckDbCredentials(credentials)) throw new Error('DuckDB database path is not resolved');
    if (!sql) {
      const built = this.queryBuilder.buildQuery(definition);
      sql = isQueryBuildResult(built) ? built.sql : built;
    }
    const maxRows = options?.maxRowsPerBatch || 1000;
    const adapter = this.adapterFactory.createForDatabasePath(credentials.databasePath);
    try {
      const stream = await adapter.streamQuery(sql);
      const columns = stream.columnNames;
      let buffer: Record<string, unknown>[] = [];
      const emit = (rows: Record<string, unknown>[]): SqlRunBatch<Row> => {
        const mapped = rows.map(r => {
          const obj: Record<string, unknown> = {};
          for (const c of columns) obj[c] = serializeDuckDbValue(r[c]);
          return obj;
        }) as Row[];
        return new SqlRunBatch<Row>(mapped, null, columns);
      };
      for (let rows = await stream.fetchRows(); rows !== null; rows = await stream.fetchRows()) {
        buffer.push(...rows);
        while (buffer.length >= maxRows) {
          yield emit(buffer.slice(0, maxRows));
          buffer = buffer.slice(maxRows);
        }
      }
      yield emit(buffer); // final (possibly-partial / empty) page
      await stream.close();
    } finally {
      await adapter.close();
    }
  }
}
