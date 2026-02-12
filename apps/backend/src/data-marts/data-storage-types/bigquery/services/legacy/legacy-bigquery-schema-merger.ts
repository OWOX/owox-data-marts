import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { BigQuerySchemaMerger } from '../bigquery-schema-merger';

@Injectable()
export class LegacyBigQuerySchemaMerger extends BigQuerySchemaMerger {
  protected readonly logger = new Logger(LegacyBigQuerySchemaMerger.name);
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;
}
