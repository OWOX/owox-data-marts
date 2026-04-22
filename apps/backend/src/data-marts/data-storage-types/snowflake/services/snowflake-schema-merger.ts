import { Injectable } from '@nestjs/common';
import { isSnowflakeDataMartSchema } from '../../data-mart-schema.guards';
import { DataMartSchema } from '../../data-mart-schema.type';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { FlatDataMartSchemaMerger } from '../../interfaces/flat-data-mart-schema-merger';

@Injectable()
export class SnowflakeSchemaMerger extends FlatDataMartSchemaMerger {
  readonly type = DataStorageType.SNOWFLAKE;
  protected readonly storageName = 'Snowflake';

  protected isSchemaValid(schema: DataMartSchema): boolean {
    return isSnowflakeDataMartSchema(schema);
  }
}
