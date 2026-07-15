import { Injectable } from '@nestjs/common';
import { SqlRunExecutor, SqlRunExecuteOptions } from '../../interfaces/sql-run-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isBigQueryCredentials } from '../../data-storage-credentials.guards';
import { isBigQueryConfig } from '../../data-storage-config.guards';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import { SqlRunBatch } from '../../../dto/domain/sql-run-batch.dto';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { BigQueryQueryBuilder } from './bigquery-query.builder';
import { isQueryBuildResult } from '../../interfaces/data-mart-query-builder.interface';
import type { SqlParameter } from '../../utils/sql-clause-renderer';
import { wrapProviderError } from '../../utils/provider-error.utils';

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
    options?: SqlRunExecuteOptions
  ): AsyncIterable<SqlRunBatch<Row>> {
    if (!isBigQueryCredentials(credentials)) {
      throw new Error('BigQuery storage credentials expected');
    }
    if (!isBigQueryConfig(config)) {
      throw new Error('BigQuery storage config expected');
    }

    const adapter = this.adapterFactory.create(credentials, config);

    let params: SqlParameter[] | undefined = options?.params;
    if (!sql) {
      const built = await this.queryBuilder.buildQuery(definition);
      if (isQueryBuildResult(built)) {
        sql = built.sql;
        params = params ?? built.params;
      } else {
        sql = built;
      }
    }

    const { jobId } = await adapter.executeQuery(sql, params, undefined, options?.signal);
    const job = await adapter.getJob(jobId);

    await job.promise();

    const { status, configuration } = job.metadata;
    if (status?.errorResult) {
      const err = status.errorResult;
      throw wrapProviderError(`BigQuery job failed [${err.reason}]: ${err.message}`, err);
    }

    const destinationTable = configuration.query.destinationTable;
    const table = adapter.createTableReference(
      destinationTable.projectId,
      destinationTable.datasetId,
      destinationTable.tableId
    );
    const [tableMetadata] = await table.getMetadata();
    const columns =
      tableMetadata?.schema?.fields?.map(field => field.name).filter(Boolean) ?? undefined;

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
      yield new SqlRunBatch<Row>(mapped, nextBatchToken, columns);

      pageToken = nextQuery?.pageToken ?? undefined;
    } while (pageToken);
  }
}
