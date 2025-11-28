import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { SqlDryRunResult } from '../../../dto/domain/sql-dry-run-result.dto';
import { isSnowflakeConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isSnowflakeCredentials } from '../../data-storage-credentials.guards';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { SqlDryRunExecutor } from '../../interfaces/sql-dry-run-executor.interface';
import { SnowflakeApiAdapterFactory } from '../adapters/snowflake-api-adapter.factory';

@Injectable()
export class SnowflakeSqlDryRunExecutor implements SqlDryRunExecutor {
  readonly type = DataStorageType.SNOWFLAKE;
  private readonly logger = new Logger(SnowflakeSqlDryRunExecutor.name);

  constructor(private readonly adapterFactory: SnowflakeApiAdapterFactory) {}

  async execute(
    dataStorageCredentials: DataStorageCredentials,
    dataStorageConfig: DataStorageConfig,
    sql: string
  ): Promise<SqlDryRunResult> {
    this.logger.debug('Executing SQL dry run', sql);

    if (!isSnowflakeCredentials(dataStorageCredentials)) {
      throw new BusinessViolationException('Snowflake storage credentials expected');
    }

    if (!isSnowflakeConfig(dataStorageConfig)) {
      throw new BusinessViolationException('Snowflake storage config expected');
    }

    try {
      const adapter = this.adapterFactory.create(dataStorageCredentials, dataStorageConfig);
      const explain = await adapter.executeDryRunQuery(sql ?? '');
      const explainSummary = {
        partitionsTotal: explain?.GlobalStats?.partitionsTotal,
        partitionsAssigned: explain?.GlobalStats?.partitionsAssigned,
        bytesAssigned: explain?.GlobalStats?.bytesAssigned,
      };
      this.logger.debug(`Query validation successful: ${JSON.stringify(explainSummary)}`);
      await adapter.destroy();
      return SqlDryRunResult.success(explain.GlobalStats.bytesAssigned);
    } catch (error) {
      this.logger.debug('Dry run failed', error);
      return SqlDryRunResult.failed(error.message);
    }
  }
}
