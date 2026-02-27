import { Injectable, Logger, Scope } from '@nestjs/common';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { DataStorageCredentialsResolver } from '../../../data-storage-credentials-resolver.service';
import { BigQueryApiAdapterFactory } from '../../adapters/bigquery-api-adapter.factory';
import { BigQueryReportReader } from '../bigquery-report-reader.service';
import { LegacyBigQueryQueryBuilder } from './legacy-bigquery-query.builder';
import { LegacyBigQueryReportHeadersGenerator } from './legacy-bigquery-report-headers-generator.service';

@Injectable({ scope: Scope.TRANSIENT })
export class LegacyBigQueryReportReader extends BigQueryReportReader {
  protected readonly logger = new Logger(LegacyBigQueryReportReader.name);
  readonly type: DataStorageType = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  constructor(
    protected readonly adapterFactory: BigQueryApiAdapterFactory,
    protected readonly bigQueryQueryBuilder: LegacyBigQueryQueryBuilder,
    protected readonly headersGenerator: LegacyBigQueryReportHeadersGenerator,
    protected readonly credentialsResolver: DataStorageCredentialsResolver
  ) {
    super(adapterFactory, bigQueryQueryBuilder, headersGenerator, credentialsResolver);
  }
}
