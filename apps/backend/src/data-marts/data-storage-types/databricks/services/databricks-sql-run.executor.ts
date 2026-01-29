import { Injectable } from '@nestjs/common';
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

@Injectable()
export class DatabricksSqlRunExecutor implements SqlRunExecutor {
  readonly type = DataStorageType.DATABRICKS;

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

    try {
      const { rows } = await adapter.executeQuery(sql);

      if (!rows || rows.length === 0) {
        yield new SqlRunBatch<Row>([], null);
        return;
      }

      const maxRowsPerBatch = options?.maxRowsPerBatch || 1000;

      for (let i = 0; i < rows.length; i += maxRowsPerBatch) {
        const batch = rows.slice(i, i + maxRowsPerBatch) as Row[];
        const isLast = i + maxRowsPerBatch >= rows.length;
        const nextBatchId = isLast ? null : String(i + maxRowsPerBatch);
        yield new SqlRunBatch<Row>(batch, nextBatchId);
      }
    } finally {
      await adapter.destroy();
    }
  }
}
