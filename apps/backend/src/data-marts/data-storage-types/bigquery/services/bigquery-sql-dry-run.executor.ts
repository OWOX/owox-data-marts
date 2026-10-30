import { TableSchema } from '@google-cloud/bigquery';
import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { SqlDryRunResult } from '../../../dto/domain/sql-dry-run-result.dto';
import { isBigQueryConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import {
  isBigQueryCredentials,
  isBigQueryManagedCredentials,
} from '../../data-storage-credentials.guards';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { SqlDryRunExecutor } from '../../interfaces/sql-dry-run-executor.interface';
import { OwoxStorageStatementException } from '../../../owox-storage/owox-storage.exceptions';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import { BigQueryFieldType, parseBigQueryFieldType } from '../enums/bigquery-field-type.enum';

/** Maps top-level scalar result columns to their BigQuery type; skips repeated and record columns. */
export function bigQueryColumnTypes(schema: TableSchema | undefined): ReadonlyMap<string, string> {
  const types = new Map<string, string>();
  for (const field of schema?.fields ?? []) {
    if (!field.name || field.mode === 'REPEATED' || !field.type) continue;
    const type = parseBigQueryFieldType(field.type);
    if (type && type !== BigQueryFieldType.RECORD && type !== BigQueryFieldType.STRUCT) {
      types.set(field.name, type);
    }
  }
  return types;
}

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
      // An OWOX Storage runs SELECT only, so the editor must refuse anything else (same text as the run gate).
      if (
        isBigQueryManagedCredentials(dataStorageCredentials) &&
        result.statementType !== 'SELECT'
      ) {
        return SqlDryRunResult.failed(
          new OwoxStorageStatementException(result.statementType).message
        );
      }
      return SqlDryRunResult.success(
        result.totalBytesProcessed,
        bigQueryColumnTypes(result.schema)
      );
    } catch (error) {
      this.logger.debug('Dry run failed', error);
      return SqlDryRunResult.failed(error.message);
    }
  }
}
