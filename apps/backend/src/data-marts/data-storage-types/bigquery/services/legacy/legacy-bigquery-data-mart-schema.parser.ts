import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { BigQueryDataMartSchemaParser } from '../bigquery-data-mart-schema.parser';

@Injectable()
export class LegacyBigQueryDataMartSchemaParser extends BigQueryDataMartSchemaParser {
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;
}
