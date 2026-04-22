import { Injectable } from '@nestjs/common';
import { DataMartSchema } from '../../data-mart-schema.type';
import { isAthenaDataMartSchema } from '../../data-mart-schema.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { FlatReportHeadersGenerator } from '../../interfaces/flat-report-headers-generator';

@Injectable()
export class AthenaReportHeadersGenerator extends FlatReportHeadersGenerator {
  readonly type = DataStorageType.AWS_ATHENA;
  protected readonly storageName = 'Athena';

  protected isSchemaValid(schema: DataMartSchema): boolean {
    return isAthenaDataMartSchema(schema);
  }
}
