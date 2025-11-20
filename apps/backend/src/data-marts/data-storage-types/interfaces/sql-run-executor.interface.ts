import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataStorageConfig } from '../data-storage-config.type';
import { DataStorageCredentials } from '../data-storage-credentials.type';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { SqlRunBatch } from '../../dto/domain/sql-run-batch.dto';
import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';

/**
 * Executes SQL and returns results in batches without loading all data into memory.
 */
export interface SqlRunExecutor extends TypedComponent<DataStorageType> {
  execute<Row = Record<string, unknown>>(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    definition: DataMartDefinition,
    sql: string | undefined,
    options?: { maxRowsPerBatch?: number }
  ): AsyncIterable<SqlRunBatch<Row>>;
}
