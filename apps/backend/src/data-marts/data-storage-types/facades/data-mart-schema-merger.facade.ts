import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataMartSchema } from '../data-mart-schema.type';
import { DATA_MART_SCHEMA_MERGER_RESOLVER } from '../data-storage-providers';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartSchemaMerger } from '../interfaces/data-mart-schema-merger.interface';

@Injectable()
export class DataMartSchemaMergerFacade {
  constructor(
    @Inject(DATA_MART_SCHEMA_MERGER_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, DataMartSchemaMerger>
  ) {}

  async mergeSchemas(
    storageType: DataStorageType,
    existingSchema: DataMartSchema | undefined,
    newSchema: DataMartSchema
  ): Promise<DataMartSchema> {
    if (existingSchema && existingSchema.type !== newSchema.type) {
      throw new Error('Cannot merge schemas of different types');
    }

    const schemaMerger = await this.resolver.resolve(storageType);
    return schemaMerger.mergeSchemas(existingSchema, newSchema);
  }
}
