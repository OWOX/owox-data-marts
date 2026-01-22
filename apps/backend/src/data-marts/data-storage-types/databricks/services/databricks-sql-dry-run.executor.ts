import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { SqlDryRunResult } from '../../../dto/domain/sql-dry-run-result.dto';
import { isDatabricksConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isDatabricksCredentials } from '../../data-storage-credentials.guards';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { SqlDryRunExecutor } from '../../interfaces/sql-dry-run-executor.interface';
import { DatabricksApiAdapterFactory } from '../adapters/databricks-api-adapter.factory';

@Injectable()
export class DatabricksSqlDryRunExecutor implements SqlDryRunExecutor {
  readonly type = DataStorageType.DATABRICKS;
  private readonly logger = new Logger(DatabricksSqlDryRunExecutor.name);

  constructor(private readonly adapterFactory: DatabricksApiAdapterFactory) {}

  async execute(
    dataStorageCredentials: DataStorageCredentials,
    dataStorageConfig: DataStorageConfig,
    sql: string
  ): Promise<SqlDryRunResult> {
    this.logger.debug('Executing SQL dry run', sql);

    if (!isDatabricksCredentials(dataStorageCredentials)) {
      throw new BusinessViolationException('Databricks storage credentials expected');
    }

    if (!isDatabricksConfig(dataStorageConfig)) {
      throw new BusinessViolationException('Databricks storage config expected');
    }

    try {
      const adapter = this.adapterFactory.create(dataStorageCredentials, dataStorageConfig);
      const explain = await adapter.executeDryRunQuery(sql ?? '');

      if (!explain.isValid) {
        this.logger.debug('Dry run failed', explain.error);
        await adapter.destroy();
        return SqlDryRunResult.failed(explain.error || 'Query validation failed');
      }

      this.logger.debug('Query validation successful');
      await adapter.destroy();
      return SqlDryRunResult.success(0);
    } catch (error) {
      this.logger.debug('Dry run failed', error);
      return SqlDryRunResult.failed(error.message);
    }
  }
}
