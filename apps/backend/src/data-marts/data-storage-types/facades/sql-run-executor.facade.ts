import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataStorageConfig } from '../data-storage-config.type';
import { DataStorageCredentials } from '../data-storage-credentials.type';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { SqlRunBatch } from '../../dto/domain/sql-run-batch.dto';
import { SqlRunExecutor } from '../interfaces/sql-run-executor.interface';
import { SQL_RUN_EXECUTOR_RESOLVER } from '../data-storage-providers';
import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';

@Injectable()
export class SqlRunExecutorFacade {
  constructor(
    @Inject(SQL_RUN_EXECUTOR_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, SqlRunExecutor>
  ) {}

  async *executeBatches<Row = Record<string, unknown>>(
    type: DataStorageType,
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    definition: DataMartDefinition,
    sql: string | undefined,
    options?: { maxRowsPerBatch?: number }
  ): AsyncGenerator<SqlRunBatch<Row>> {
    const executor = await this.resolver.resolve(type);
    // proxy generator from executor
    yield* executor.execute<Row>(credentials, config, definition, sql, options);
  }
}
