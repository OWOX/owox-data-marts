import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { BigQueryApiAdapterFactory } from '../../adapters/bigquery-api-adapter.factory';
import { BigQueryDataMartSchemaProvider } from '../bigquery-data-mart-schema.provider';

import { LegacyBigQueryQueryBuilder } from './legacy-bigquery-query.builder';

@Injectable()
export class LegacyBigQueryDataMartSchemaProvider extends BigQueryDataMartSchemaProvider {
  protected readonly logger = new Logger(LegacyBigQueryDataMartSchemaProvider.name);
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  constructor(
    protected readonly adapterFactory: BigQueryApiAdapterFactory,
    protected readonly bigQueryQueryBuilder: LegacyBigQueryQueryBuilder
  ) {
    super(adapterFactory, bigQueryQueryBuilder);
  }
}
