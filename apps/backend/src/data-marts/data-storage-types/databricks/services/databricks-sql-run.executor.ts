import { Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { SqlRunExecutor } from '../../interfaces/sql-run-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isDatabricksCredentials } from '../../data-storage-credentials.guards';
import { isDatabricksConfig } from '../../data-storage-config.guards';
import { DatabricksApiAdapterFactory } from '../adapters/databricks-api-adapter.factory';
import { SqlRunBatch } from '../../../dto/domain/sql-run-batch.dto';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DatabricksQueryBuilder } from './databricks-query.builder';
import type { DatabricksQueryCursor } from '../adapters/databricks-api.adapter';

@Injectable()
export class DatabricksSqlRunExecutor implements SqlRunExecutor {
  readonly type = DataStorageType.DATABRICKS;
  private readonly logger = new Logger(DatabricksSqlRunExecutor.name);

  constructor(
    private readonly adapterFactory: DatabricksApiAdapterFactory,
    private readonly queryBuilder: DatabricksQueryBuilder
  ) {}

  async *execute<Row = Record<string, unknown>>(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    definition: DataMartDefinition,
    sql: string | undefined,
    options?: { maxRowsPerBatch?: number }
  ): AsyncIterable<SqlRunBatch<Row>> {
    if (!isDatabricksCredentials(credentials)) {
      throw new Error('Databricks storage credentials expected');
    }
    if (!isDatabricksConfig(config)) {
      throw new Error('Databricks storage config expected');
    }

    const adapter = this.adapterFactory.create(credentials, config);
    if (!sql) {
      sql = this.queryBuilder.buildQuery(definition);
    }

    let cursor: DatabricksQueryCursor | null = null;
    let executionError: Error | null = null;
    let closeError: Error | null = null;

    try {
      const maxRowsPerBatch = options?.maxRowsPerBatch || 1000;
      cursor = await adapter.openQueryCursor(sql);
      let rowsRead = 0;
      let hasEmittedRows = false;
      let columns = await cursor.getColumns();
      let columnsResolvedFromRowData = false;

      while (true) {
        const rows = (await cursor.fetchChunk(maxRowsPerBatch)) as Row[];
        if (!rows.length) {
          if (!hasEmittedRows) {
            yield new SqlRunBatch<Row>([], null, columns ?? null);
          }
          break;
        }

        hasEmittedRows = true;
        rowsRead += rows.length;

        if (!columnsResolvedFromRowData) {
          columns = Object.keys(rows[0] as Record<string, unknown>);
          columnsResolvedFromRowData = true;
        }

        const hasMoreRows = await cursor.hasMoreRows();
        const nextBatchId = hasMoreRows ? String(rowsRead) : null;
        yield new SqlRunBatch<Row>(rows, nextBatchId, columns);

        if (!hasMoreRows) {
          break;
        }
      }
    } catch (error) {
      executionError = castError(error);
    } finally {
      try {
        if (cursor) {
          await cursor.close();
        }
      } catch (error) {
        closeError = castError(error);
        if (executionError) {
          this.logger.warn(
            `Failed to close Databricks cursor after SQL run error: ${closeError.message}. Preserving original error: ${executionError.message}`
          );
        }
      } finally {
        await adapter.destroy();
      }
    }

    if (executionError) {
      throw executionError;
    }

    if (closeError) {
      throw new Error(`Failed to close Databricks cursor after SQL run: ${closeError.message}`);
    }
  }
}
