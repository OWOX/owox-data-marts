import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { BigQueryApiAdapterFactory } from '../../adapters/bigquery-api-adapter.factory';
import { BigQuerySqlRunExecutor } from '../bigquery-sql-run.executor';
import { LegacyBigQueryQueryBuilder } from './legacy-bigquery-query.builder';

@Injectable()
export class LegacyBigQuerySqlRunExecutor extends BigQuerySqlRunExecutor {
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  constructor(
    protected readonly adapterFactory: BigQueryApiAdapterFactory,
    protected readonly queryBuilder: LegacyBigQueryQueryBuilder
  ) {
    super(adapterFactory, queryBuilder);
  }
}
