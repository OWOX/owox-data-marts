import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { SqlDryRunResult } from '../../../dto/domain/sql-dry-run-result.dto';
import { isAthenaConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isAthenaCredentials } from '../../data-storage-credentials.guards';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { SqlDryRunExecutor } from '../../interfaces/sql-dry-run-executor.interface';
import { AthenaApiAdapterFactory } from '../adapters/athena-api-adapter.factory';
import { AthenaApiAdapter } from '../adapters/athena-api.adapter';

@Injectable()
export class AthenaSqlDryRunExecutor implements SqlDryRunExecutor {
  readonly type = DataStorageType.AWS_ATHENA;
  private readonly logger = new Logger(AthenaSqlDryRunExecutor.name);

  constructor(private readonly adapterFactory: AthenaApiAdapterFactory) {}

  /**
   * Executes a dry run of the provided SQL query in AWS Athena to validate its syntax.
   * Throws an exception if credentials or config are invalid.
   * Returns a success or failure result based on query validation.
   *
   * @param dataStorageCredentials - Credentials for Athena access
   * @param dataStorageConfig - Athena storage configuration
   * @param sql - SQL query string to validate
   * @returns SqlDryRunResult indicating success or failure and error details if any
   * @throws BusinessViolationException if credentials or config are invalid
   */
  async execute(
    dataStorageCredentials: DataStorageCredentials,
    dataStorageConfig: DataStorageConfig,
    sql: string
  ): Promise<SqlDryRunResult> {
    this.logger.debug('Executing SQL dry run', sql);

    if (!isAthenaCredentials(dataStorageCredentials)) {
      throw new BusinessViolationException('Athena storage credentials expected');
    }

    if (!isAthenaConfig(dataStorageConfig)) {
      throw new BusinessViolationException('Athena storage config expected');
    }

    try {
      const adapter = this.adapterFactory.create(dataStorageCredentials, dataStorageConfig);
      await adapter.executeDryRunQuery(sql ?? '', dataStorageConfig.outputBucket);
      return SqlDryRunResult.success();
    } catch (error) {
      this.logger.debug('Athena dry run failed', error);
      return SqlDryRunResult.failed(
        error.message.replace(AthenaApiAdapter.ATHENA_QUERY_ERROR_PREFIX, '').trim()
      );
    }
  }
}
