import { Injectable } from '@nestjs/common';
import { isRedshiftDataMartSchema } from '../../data-mart-schema.guards';
import { DataMartSchema } from '../../data-mart-schema.type';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { FlatDataMartSchemaMerger } from '../../interfaces/flat-data-mart-schema-merger';

@Injectable()
export class RedshiftSchemaMerger extends FlatDataMartSchemaMerger {
  readonly type = DataStorageType.AWS_REDSHIFT;
  protected readonly storageName = 'Redshift';

  protected isSchemaValid(schema: DataMartSchema): boolean {
    return isRedshiftDataMartSchema(schema);
  }
}
