import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataStorageConfig } from '../data-storage-config.type';

export interface DataStorageTitleGenerator extends TypedComponent<DataStorageType> {
  generateTitle(config: DataStorageConfig): string;
}
