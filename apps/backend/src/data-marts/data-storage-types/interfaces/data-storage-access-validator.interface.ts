import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataStorageConfig } from '../data-storage-config.type';

export interface DataStorageAccessValidator extends TypedComponent<DataStorageType> {
  validate(
    config: DataStorageConfig,
    credentials: Record<string, unknown>
  ): Promise<ValidationResult>;
}

export class ValidationResult {
  constructor(
    public readonly valid: boolean,
    public readonly errorMessage?: string,
    public readonly reason?: Record<string, unknown>
  ) {}
}
