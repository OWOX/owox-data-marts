import { Injectable, Logger } from '@nestjs/common';
import { SqlDryRunExecutor } from '../../../interfaces/sql-dry-run-executor.interface';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../../data-storage-credentials.type';
import { DataStorageConfig } from '../../../data-storage-config.type';
import { SqlDryRunResult } from '../../../../dto/domain/sql-dry-run-result.dto';
import { BigquerySqlDryRunExecutor } from '../bigquery-sql-dry-run.executor';
import { LegacyBigQuerySqlPreprocessor } from './legacy-bigquery-sql-preprocessor.service';

@Injectable()
export class LegacyBigQuerySqlDryRunExecutor implements SqlDryRunExecutor {
  private readonly logger = new Logger(LegacyBigQuerySqlDryRunExecutor.name);
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  constructor(
    private readonly preprocessor: LegacyBigQuerySqlPreprocessor,
    private readonly executor: BigquerySqlDryRunExecutor
  ) {}

  async execute(
    dataStorageCredentials: DataStorageCredentials,
    dataStorageConfig: DataStorageConfig,
    sql: string
  ): Promise<SqlDryRunResult> {
    try {
      const preparedSql = await this.preprocessor.prepare(sql);
      return this.executor.execute(dataStorageCredentials, dataStorageConfig, preparedSql);
    } catch (error) {
      this.logger.debug('Dry run failed', error);
      return SqlDryRunResult.failed(error.message);
    }
  }
}
