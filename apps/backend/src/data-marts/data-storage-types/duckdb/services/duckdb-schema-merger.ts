import { Injectable } from '@nestjs/common';
import { isDuckDbDataMartSchema } from '../../data-mart-schema.guards';
import { DataMartSchema } from '../../data-mart-schema.type';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { FlatDataMartSchemaMerger } from '../../interfaces/flat-data-mart-schema-merger';

@Injectable()
export class DuckDbSchemaMerger extends FlatDataMartSchemaMerger {
  readonly type = DataStorageType.DUCKDB;
  protected readonly storageName = 'DuckDB';

  protected isSchemaValid(schema: DataMartSchema): boolean {
    return isDuckDbDataMartSchema(schema);
  }
}
