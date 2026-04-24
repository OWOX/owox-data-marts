import { Injectable } from '@nestjs/common';
import { isAthenaDataMartSchema } from '../../data-mart-schema.guards';
import { DataMartSchema } from '../../data-mart-schema.type';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { FlatDataMartSchemaMerger } from '../../interfaces/flat-data-mart-schema-merger';

@Injectable()
export class AthenaSchemaMerger extends FlatDataMartSchemaMerger {
  readonly type = DataStorageType.AWS_ATHENA;
  protected readonly storageName = 'Athena';

  protected isSchemaValid(schema: DataMartSchema): boolean {
    return isAthenaDataMartSchema(schema);
  }
}
