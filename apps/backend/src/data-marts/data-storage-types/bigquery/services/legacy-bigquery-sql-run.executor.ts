import { Injectable } from '@nestjs/common';
import { SqlRunExecutor } from '../../interfaces/sql-run-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { SqlRunBatch } from '../../../dto/domain/sql-run-batch.dto';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { BigQuerySqlRunExecutor } from './bigquery-sql-run.executor';
import { BigQueryQueryBuilder } from './bigquery-query.builder';
import { LegacyBigQuerySqlPreprocessor } from './legacy-bigquery-sql-preprocessor.service';

@Injectable()
export class LegacyBigQuerySqlRunExecutor implements SqlRunExecutor {
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  constructor(
    private readonly preprocessor: LegacyBigQuerySqlPreprocessor,
    private readonly executor: BigQuerySqlRunExecutor,
    private readonly queryBuilder: BigQueryQueryBuilder
  ) {}

  async *execute<Row = Record<string, unknown>>(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    definition: DataMartDefinition,
    sql: string | undefined,
    options?: { maxRowsPerBatch?: number }
  ): AsyncIterable<SqlRunBatch<Row>> {
    let effectiveSql = sql;

    if (!effectiveSql) {
      effectiveSql = this.queryBuilder.buildQuery(definition);
    }

    const preparedSql = await this.preprocessor.prepare(effectiveSql);
    yield* this.executor.execute(credentials, config, definition, preparedSql, options);
  }
}
