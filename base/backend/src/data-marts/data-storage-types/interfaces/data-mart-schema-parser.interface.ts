import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartSchema } from '../data-mart-schema.type';

export interface DataMartSchemaParser extends TypedComponent<DataStorageType> {
  readonly type: DataStorageType;
  validateAndParse(schema: unknown): Promise<DataMartSchema>;
}
