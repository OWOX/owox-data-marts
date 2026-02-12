import { Injectable } from '@nestjs/common';
import { SqlRunExecutor } from '../../interfaces/sql-run-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isBigQueryCredentials } from '../../data-storage-credentials.guards';
import { isBigQueryConfig } from '../../data-storage-config.guards';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import { SqlRunBatch } from '../../../dto/domain/sql-run-batch.dto';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { BigQueryQueryBuilder } from './bigquery-query.builder';

@Injectable()
export class BigQuerySqlRunExecutor implements SqlRunExecutor {
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;

  constructor(
    protected readonly adapterFactory: BigQueryApiAdapterFactory,
    protected readonly queryBuilder: BigQueryQueryBuilder
  ) {}

  async *execute<Row = Record<string, unknown>>(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    definition: DataMartDefinition,
    sql: string | undefined,
    options?: { maxRowsPerBatch?: number }
  ): AsyncIterable<SqlRunBatch<Row>> {
    if (!isBigQueryCredentials(credentials)) {
      throw new Error('BigQuery storage credentials expected');
    }
    if (!isBigQueryConfig(config)) {
      throw new Error('BigQuery storage config expected');
    }

    const adapter = this.adapterFactory.create(credentials, config);
    if (!sql) {
      sql = await this.queryBuilder.buildQuery(definition);
    }

    const { jobId } = await adapter.executeQuery(sql);
    const job = await adapter.getJob(jobId);

    await job.promise();

    const { status, configuration } = job.metadata;
    if (status?.errorResult) {
      const err = status.errorResult;
      throw new Error(`BigQuery job failed [${err.reason}]: ${err.message}`);
    }

    const destinationTable = configuration.query.destinationTable;
    const table = adapter.createTableReference(
      destinationTable.projectId,
      destinationTable.datasetId,
      destinationTable.tableId
    );

    let pageToken: string | undefined = undefined;
    const maxResults = options?.maxRowsPerBatch ?? 5000;

    do {
      const [rows, nextQuery] = await table.getRows({
        pageToken,
        maxResults,
        autoPaginate: false,
      });

      const mapped = Array.isArray(rows) ? (rows as Row[]) : [];

      const nextBatchToken: string | null = nextQuery?.pageToken ?? null;
      yield new SqlRunBatch<Row>(mapped, nextBatchToken);

      pageToken = nextQuery?.pageToken ?? undefined;
    } while (pageToken);
  }
}
