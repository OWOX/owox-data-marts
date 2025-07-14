import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartSchema } from '../data-mart-schema.type';
import { DataStorageConfig } from '../data-storage-config.type';
import { DataStorageCredentials } from '../data-storage-credentials.type';
import { DataStorageType } from '../enums/data-storage-type.enum';

export interface DataMartSchemaProvider extends TypedComponent<DataStorageType> {
  getActualDataMartSchema(
    dataMartDefinition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<DataMartSchema>;
}
