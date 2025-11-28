import { Injectable } from '@nestjs/common';
import { SqlRunExecutor } from '../../interfaces/sql-run-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isSnowflakeCredentials } from '../../data-storage-credentials.guards';
import { isSnowflakeConfig } from '../../data-storage-config.guards';
import { SnowflakeApiAdapterFactory } from '../adapters/snowflake-api-adapter.factory';
import { SqlRunBatch } from '../../../dto/domain/sql-run-batch.dto';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { SnowflakeQueryBuilder } from './snowflake-query.builder';

@Injectable()
export class SnowflakeSqlRunExecutor implements SqlRunExecutor {
  readonly type = DataStorageType.SNOWFLAKE;

  constructor(
    private readonly adapterFactory: SnowflakeApiAdapterFactory,
    private readonly queryBuilder: SnowflakeQueryBuilder
  ) {}

  async *execute<Row = Record<string, unknown>>(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    definition: DataMartDefinition,
    sql: string | undefined,
    options?: { maxRowsPerBatch?: number }
  ): AsyncIterable<SqlRunBatch<Row>> {
    if (!isSnowflakeCredentials(credentials)) {
      throw new Error('Snowflake storage credentials expected');
    }
    if (!isSnowflakeConfig(config)) {
      throw new Error('Snowflake storage config expected');
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
