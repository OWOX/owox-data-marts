import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaMerger } from '../../interfaces/data-mart-schema-merger.interface';
import { DataMartSchema } from '../../data-mart-schema.type';

@Injectable()
export class SnowflakeSchemaMerger implements DataMartSchemaMerger {
  readonly type = DataStorageType.SNOWFLAKE;

  mergeSchemas(
    existingSchema: DataMartSchema | undefined,
    newSchema: DataMartSchema
  ): DataMartSchema {
    // TODO: Implement proper schema merging
    // For now, return newSchema to allow compilation
    return newSchema;
  }
}
