import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../data-storage-credentials.type';
import { DataStorageConfig } from '../data-storage-config.type';

export interface CreateViewResult {
  fullyQualifiedName: string;
}

export interface CreateViewOptions {
  requireFullyQualifiedName?: boolean;
}

/**
 * Storage-specific executor that creates or replaces a view for the provided SQL query.
 */
export interface CreateViewExecutor extends TypedComponent<DataStorageType> {
  createView(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    viewName: string,
    sql: string,
    options?: CreateViewOptions
  ): Promise<CreateViewResult>;
}
