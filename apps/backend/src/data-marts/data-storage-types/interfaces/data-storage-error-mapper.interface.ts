import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';

export type StorageReadErrorMappingOptions = {
  force?: boolean;
};

export interface DataStorageErrorMapper extends TypedComponent<DataStorageType> {
  toStorageReadError(error: unknown, options?: StorageReadErrorMappingOptions): unknown;
}
