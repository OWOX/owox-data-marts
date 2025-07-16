import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { SqlDryRunResult } from '../../../dto/domain/sql-dry-run-result.dto';
import { isBigQueryConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isBigQueryCredentials } from '../../data-storage-credentials.guards';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { SqlDryRunExecutor } from '../../interfaces/sql-dry-run-executor.interface';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';

@Injectable()
export class BigquerySqlDryRunExecutor implements SqlDryRunExecutor {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;
  private readonly logger = new Logger(BigquerySqlDryRunExecutor.name);

  constructor(private readonly adapterFactory: BigQueryApiAdapterFactory) {}

  async execute(
    dataStorageCredentials: DataStorageCredentials,
    dataStorageConfig: DataStorageConfig,
    sql: string
  ): Promise<SqlDryRunResult> {
    this.logger.debug('Executing SQL dry run', sql);

    if (!isBigQueryCredentials(dataStorageCredentials)) {
      throw new BusinessViolationException('BigQuery storage credentials expected');
    }

    if (!isBigQueryConfig(dataStorageConfig)) {
      throw new BusinessViolationException('BigQuery storage config expected');
    }

    try {
      const adapter = this.adapterFactory.create(dataStorageCredentials, dataStorageConfig);
      const result = await adapter.executeDryRunQuery(sql ?? '');
      return SqlDryRunResult.success(result.totalBytesProcessed);
    } catch (error) {
      this.logger.debug('Dry run failed', error);
      return SqlDryRunResult.failed(error.message);
    }
  }
}
