import { Injectable, Logger } from '@nestjs/common';
import { SqlRunExecutor } from '../../interfaces/sql-run-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isAthenaCredentials } from '../../data-storage-credentials.guards';
import { isAthenaConfig } from '../../data-storage-config.guards';
import { AthenaApiAdapterFactory } from '../adapters/athena-api-adapter.factory';
import { S3ApiAdapterFactory } from '../adapters/s3-api-adapter.factory';
import { SqlRunBatch } from '../../../dto/domain/sql-run-batch.dto';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { AthenaQueryBuilder } from './athena-query.builder';

@Injectable()
export class AthenaSqlRunExecutor implements SqlRunExecutor {
  readonly type = DataStorageType.AWS_ATHENA;
  private readonly logger = new Logger(AthenaSqlRunExecutor.name);

  constructor(
    private readonly athenaAdapterFactory: AthenaApiAdapterFactory,
    private readonly s3AdapterFactory: S3ApiAdapterFactory,
    private readonly queryBuilder: AthenaQueryBuilder
  ) {}

  async *execute<Row = Record<string, unknown>>(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    definition: DataMartDefinition,
    sql: string | undefined,
    options?: { maxRowsPerBatch?: number }
  ): AsyncGenerator<SqlRunBatch<Row>> {
    if (!isAthenaCredentials(credentials)) {
      throw new Error('Athena storage credentials expected');
    }
    if (!isAthenaConfig(config)) {
      throw new Error('Athena storage config expected');
    }

    const athena = this.athenaAdapterFactory.create(credentials, config);
    const s3 = this.s3AdapterFactory.create(credentials, config);

    const outputBucket = config.outputBucket;
    const outputPrefix = `owox-data-marts/${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    let queryExecutionId: string | undefined;
    try {
      if (!sql) {
        sql = this.queryBuilder.buildQuery(definition);
      }

      const res = await athena.executeQuery(sql, outputBucket, outputPrefix);
      queryExecutionId = res.queryExecutionId;

      await athena.waitForQueryToComplete(queryExecutionId);

      const maxRows = options?.maxRowsPerBatch ?? 1000;
      let nextToken: string | undefined = undefined;
      let columnNames: string[] | undefined;
      let isFirstPage = true;

      do {
        const results = await athena.getQueryResults(queryExecutionId, nextToken, maxRows);
        if (!results.ResultSet || !results.ResultSet.Rows) {
          throw new Error('Failed to get query results');
        }

        if (!columnNames) {
          const columnInfo = results.ResultSet.ResultSetMetadata?.ColumnInfo;
          columnNames = columnInfo?.map(c => c.Name ?? '') ?? [];
        }

        const rows = results.ResultSet.Rows;
        const startIndex = isFirstPage ? 1 : 0; // skip header row on first page
        const dataRows = rows.slice(startIndex);

        const mapped: Row[] = dataRows.map(r => {
          const obj = {} as Row;
          const data = r.Data ?? [];
          for (let i = 0; i < (columnNames?.length ?? data.length); i++) {
            const name = columnNames?.[i] ?? `col_${i}`;
            (obj as Record<string, unknown>)[name] = data[i]?.VarCharValue;
          }
          return obj;
        });

        const nextId = results.NextToken ?? null;
        yield new SqlRunBatch<Row>(mapped, nextId, columnNames ?? null);

        nextToken = results.NextToken ?? undefined;
        isFirstPage = false;
      } while (nextToken);
    } finally {
      try {
        if (outputBucket && outputPrefix) {
          await s3.cleanupOutputFiles(outputBucket, outputPrefix);
        }
      } catch (cleanupError) {
        this.logger.error('Error cleaning up Athena query results', cleanupError as Error);
      }
    }
  }
}
