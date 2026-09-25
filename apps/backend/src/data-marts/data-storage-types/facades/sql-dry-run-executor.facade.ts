import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { SqlDryRunResult } from '../../dto/domain/sql-dry-run-result.dto';
import { DataStorageConfig } from '../data-storage-config.type';
import { DataStorageCredentials } from '../data-storage-credentials.type';
import { SQL_DRY_RUN_EXECUTOR_RESOLVER } from '../data-storage-providers';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { SqlDryRunExecutor } from '../interfaces/sql-dry-run-executor.interface';

@Injectable()
export class SqlDryRunExecutorFacade {
  constructor(
    @Inject(SQL_DRY_RUN_EXECUTOR_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, SqlDryRunExecutor>
  ) {}

  async execute(
    type: DataStorageType,
    dataStorageCredentials: DataStorageCredentials,
    dataStorageConfig: DataStorageConfig,
    sql: string
  ): Promise<SqlDryRunResult> {
    const executor = await this.resolver.resolve(type);
    return executor.execute(dataStorageCredentials, dataStorageConfig, sql);
  }
}
