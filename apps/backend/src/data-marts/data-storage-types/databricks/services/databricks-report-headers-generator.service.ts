import { Injectable } from '@nestjs/common';
import { DataMartSchema } from '../../data-mart-schema.type';
import { isDatabricksDataMartSchema } from '../../data-mart-schema.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { FlatReportHeadersGenerator } from '../../interfaces/flat-report-headers-generator';

@Injectable()
export class DatabricksReportHeadersGenerator extends FlatReportHeadersGenerator {
  readonly type = DataStorageType.DATABRICKS;
  protected readonly storageName = 'Databricks';

  protected isSchemaValid(schema: DataMartSchema): boolean {
    return isDatabricksDataMartSchema(schema);
  }
}
