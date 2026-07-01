import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';

export interface IdentifierEscaper extends TypedComponent<DataStorageType> {
  escapeIdentifier(identifier: string): string;
}
