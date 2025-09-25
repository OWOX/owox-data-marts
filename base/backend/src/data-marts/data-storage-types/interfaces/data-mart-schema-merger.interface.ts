import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataMartSchema } from '../data-mart-schema.type';
import { DataStorageType } from '../enums/data-storage-type.enum';

export interface DataMartSchemaMerger extends TypedComponent<DataStorageType> {
  mergeSchemas(
    existingSchema: DataMartSchema | undefined,
    newSchema: DataMartSchema
  ): DataMartSchema;
}
