import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { BigQueryApiAdapterFactory } from '../../adapters/bigquery-api-adapter.factory';
import { BigQueryDataMartValidator } from '../bigquery-datamart.validator';
import { LegacyBigQueryQueryBuilder } from './legacy-bigquery-query.builder';

@Injectable()
export class LegacyBigQueryDataMartValidator extends BigQueryDataMartValidator {
  readonly logger = new Logger(LegacyBigQueryDataMartValidator.name);
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  constructor(
    protected readonly adapterFactory: BigQueryApiAdapterFactory,
    protected readonly bigQueryQueryBuilder: LegacyBigQueryQueryBuilder
  ) {
    super(adapterFactory, bigQueryQueryBuilder);
  }
}
