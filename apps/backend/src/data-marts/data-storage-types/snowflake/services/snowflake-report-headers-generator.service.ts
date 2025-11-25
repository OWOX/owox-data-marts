import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { ReportHeadersGenerator } from '../../interfaces/report-headers-generator.interface';
import { DataMartSchema } from '../../data-mart-schema.type';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';

@Injectable()
export class SnowflakeReportHeadersGenerator implements ReportHeadersGenerator {
  readonly type = DataStorageType.SNOWFLAKE;

  generateHeaders(dataMartSchema: DataMartSchema): ReportDataHeader[] {
    // TODO: Implement proper Snowflake header generation
    // For now, return empty headers to allow compilation
    return [];
  }
}
