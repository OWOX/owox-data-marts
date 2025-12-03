import { Injectable } from '@nestjs/common';
import { SqlDryRunExecutor } from '../../interfaces/sql-dry-run-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { SqlDryRunResult } from '../../../dto/domain/sql-dry-run-result.dto';
import { RedshiftApiAdapterFactory } from '../adapters/redshift-api-adapter.factory';
import { isRedshiftConfig } from '../../data-storage-config.guards';
import { isRedshiftCredentials } from '../../data-storage-credentials.guards';

@Injectable()
export class RedshiftSqlDryRunExecutor implements SqlDryRunExecutor {
  readonly type = DataStorageType.AWS_REDSHIFT;

  constructor(private readonly adapterFactory: RedshiftApiAdapterFactory) {}

  async execute(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    sql: string
  ): Promise<SqlDryRunResult> {
    if (!isRedshiftConfig(config)) {
      return SqlDryRunResult.failed('Incompatible data storage config');
    }

    if (!isRedshiftCredentials(credentials)) {
      return SqlDryRunResult.failed('Incompatible data storage credentials');
    }

    const adapter = this.adapterFactory.create(credentials, config);

    try {
      await adapter.executeDryRunQuery(sql);
      return SqlDryRunResult.success();
    } catch (error) {
      return SqlDryRunResult.failed(error instanceof Error ? error.message : String(error));
    }
  }
}
