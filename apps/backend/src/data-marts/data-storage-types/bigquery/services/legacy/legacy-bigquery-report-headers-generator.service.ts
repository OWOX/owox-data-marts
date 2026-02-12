import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { BigQueryReportHeadersGenerator } from '../bigquery-report-headers-generator.service';

@Injectable()
export class LegacyBigQueryReportHeadersGenerator extends BigQueryReportHeadersGenerator {
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;
}
