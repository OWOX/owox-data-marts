import { Injectable } from '@nestjs/common';
import { DataMartSchema } from '../../data-mart-schema.type';
import { isRedshiftDataMartSchema } from '../../data-mart-schema.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { FlatReportHeadersGenerator } from '../../interfaces/flat-report-headers-generator';

@Injectable()
export class RedshiftReportHeadersGenerator extends FlatReportHeadersGenerator {
  readonly type = DataStorageType.AWS_REDSHIFT;
  protected readonly storageName = 'Redshift';

  protected isSchemaValid(schema: DataMartSchema): boolean {
    return isRedshiftDataMartSchema(schema);
  }
}
