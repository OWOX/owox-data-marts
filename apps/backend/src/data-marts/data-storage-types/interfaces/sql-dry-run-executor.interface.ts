import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { SqlDryRunResult } from '../../dto/domain/sql-dry-run-result.dto';
import { DataStorageConfig } from '../data-storage-config.type';
import { DataStorageCredentials } from '../data-storage-credentials.type';
import { DataStorageType } from '../enums/data-storage-type.enum';

export interface SqlDryRunExecutor extends TypedComponent<DataStorageType> {
  execute(
    dataStorageCredentials: DataStorageCredentials,
    dataStorageConfig: DataStorageConfig,
    sql: string
  ): Promise<SqlDryRunResult>;
}
