import { Injectable } from '@nestjs/common';
import { DataMartSchema } from '../../data-mart-schema.type';
import { isDuckDbDataMartSchema } from '../../data-mart-schema.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { FlatReportHeadersGenerator } from '../../interfaces/flat-report-headers-generator';

@Injectable()
export class DuckDbReportHeadersGenerator extends FlatReportHeadersGenerator {
  readonly type = DataStorageType.DUCKDB;
  protected readonly storageName = 'DuckDB';

  protected isSchemaValid(schema: DataMartSchema): boolean {
    return isDuckDbDataMartSchema(schema);
  }
}
