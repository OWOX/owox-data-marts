import { Injectable } from '@nestjs/common';
import { DataMartSchema } from '../../data-mart-schema.type';
import { isSnowflakeDataMartSchema } from '../../data-mart-schema.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { FlatReportHeadersGenerator } from '../../interfaces/flat-report-headers-generator';

@Injectable()
export class SnowflakeReportHeadersGenerator extends FlatReportHeadersGenerator {
  readonly type = DataStorageType.SNOWFLAKE;
  protected readonly storageName = 'Snowflake';

  protected isSchemaValid(schema: DataMartSchema): boolean {
    return isSnowflakeDataMartSchema(schema);
  }
}
