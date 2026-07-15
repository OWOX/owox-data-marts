import { HttpException, Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataStorageCredentialsResolver } from '../data-storage-types/data-storage-credentials-resolver.service';
import { DATA_STORAGE_ERROR_MAPPER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { SqlRunExecutorFacade } from '../data-storage-types/facades/sql-run-executor.facade';
import { DataStorageErrorMapper } from '../data-storage-types/interfaces/data-storage-error-mapper.interface';
import { DataQualityMappedError } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataMart } from '../entities/data-mart.entity';
import {
  DataQualityCompiledCheck,
  DataQualityCompiledQuery,
  DataQualityQueryPurpose,
} from './data-quality-check-compiler';
import type { DataQualityQueryExecution } from './data-quality-result-parser';

export interface DataQualityExecutedCheck {
  check: DataQualityCompiledCheck;
  executions: DataQualityQueryExecution[];
}

export interface DataQualityQueryExecutionOptions {
  signal?: AbortSignal;
  shouldExecuteQuery?: (
    check: DataQualityCompiledCheck,
    query: DataQualityCompiledQuery,
    executions: readonly DataQualityQueryExecution[]
  ) => boolean | Promise<boolean>;
}

@Injectable()
export class DataQualityQueryExecutorService {
  constructor(
    private readonly credentialsResolver: DataStorageCredentialsResolver,
    private readonly sqlRunExecutorFacade: SqlRunExecutorFacade,
    @Inject(DATA_STORAGE_ERROR_MAPPER_RESOLVER)
    private readonly errorMapperResolver: TypeResolver<DataStorageType, DataStorageErrorMapper>
  ) {}

  async *executeChecks(
    dataMart: DataMart,
    checks: readonly DataQualityCompiledCheck[],
    options: DataQualityQueryExecutionOptions = {}
  ): AsyncGenerator<DataQualityExecutedCheck> {
    const { signal } = options;
    signal?.throwIfAborted();

    const { storage, definition } = dataMart;
    if (!storage?.config || !definition) {
      throw new Error('Storage setup is not finished.');
    }

    const credentials = await this.credentialsResolver.resolve(storage);
    signal?.throwIfAborted();
    const errorMapper = await this.errorMapperResolver.resolve(storage.type);

    for (const check of checks) {
      signal?.throwIfAborted();
      const executions: DataQualityQueryExecution[] = [];

      if (check.kind === 'EXECUTABLE') {
        for (const query of check.queries) {
          signal?.throwIfAborted();
          if (
            options.shouldExecuteQuery &&
            !(await options.shouldExecuteQuery(check, query, executions))
          ) {
            continue;
          }
          try {
            executions.push(await this.executeQuery(dataMart, credentials, query, options.signal));
            if (signal?.aborted) break;
          } catch (error) {
            if (isCancellation(error, signal)) {
              signal?.throwIfAborted();
              throw error;
            }

            executions.push({
              purpose: query.purpose,
              sql: query.sql,
              error:
                metadataUnavailableError(storage.type, query.purpose, error) ??
                toDataQualityMappedError(
                  errorMapper.toStorageReadError(error, {
                    force: true,
                  })
                ),
            });
            break;
          }
        }
      }

      yield { check, executions };
    }
  }

  private async executeQuery(
    dataMart: DataMart,
    credentials: Parameters<SqlRunExecutorFacade['executeBatches']>[1],
    query: DataQualityCompiledQuery,
    signal?: AbortSignal
  ): Promise<DataQualityQueryExecution> {
    const rows: Record<string, unknown>[] = [];
    let columnMetadata: DataQualityQueryExecution['columnMetadata'];

    for await (const batch of this.sqlRunExecutorFacade.executeBatches(
      dataMart.storage.type,
      credentials,
      dataMart.storage.config!,
      dataMart.definition!,
      query.sql,
      { signal }
    )) {
      rows.push(...batch.rows);
      if (!columnMetadata && batch.columnMetadata) {
        columnMetadata = batch.columnMetadata;
      }
    }

    return {
      purpose: query.purpose,
      sql: query.sql,
      rows,
      ...(columnMetadata ? { columnMetadata } : {}),
    };
  }
}

function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function metadataUnavailableError(
  storageType: DataStorageType,
  purpose: DataQualityQueryPurpose,
  error: unknown
): DataQualityMappedError | null {
  if (purpose !== DataQualityQueryPurpose.METADATA_FRESHNESS) return null;
  const code = explicitProviderErrorCode(error);
  if (!code || !METADATA_UNAVAILABLE_CODES[storageType]?.includes(normalizeCode(code))) {
    return null;
  }
  return {
    code: 'METADATA_UNAVAILABLE',
    message: explicitProviderErrorMessage(error) ?? 'Last-modified metadata is unavailable',
    details: null,
  };
}

const METADATA_UNAVAILABLE_CODES: Partial<Record<DataStorageType, readonly string[]>> = {
  [DataStorageType.GOOGLE_BIGQUERY]: ['NOTFOUND', 'NOT_FOUND', 'TABLE_NOT_FOUND'],
  [DataStorageType.LEGACY_GOOGLE_BIGQUERY]: ['NOTFOUND', 'NOT_FOUND', 'TABLE_NOT_FOUND'],
  [DataStorageType.SNOWFLAKE]: ['OBJECT_NOT_FOUND', '002003'],
  [DataStorageType.DATABRICKS]: [
    'DELTA_MISSING_DELTA_TABLE',
    'DELTA_NOT_A_TABLE',
    'TABLE_OR_VIEW_NOT_FOUND',
  ],
};

function explicitProviderErrorCode(error: unknown): string | null {
  const record = asRecord(error);
  const response = asRecord(record.response);
  const status = asRecord(response.status);
  const errorResult = asRecord(status.errorResult);
  const firstError = Array.isArray(record.errors) ? asRecord(record.errors[0]) : {};
  const candidates = [
    record.code,
    record.errorCode,
    record.reason,
    errorResult.reason,
    firstError.reason,
  ];
  const value = candidates.find(candidate => typeof candidate === 'string' && candidate.trim());
  return typeof value === 'string' ? value : null;
}

function explicitProviderErrorMessage(error: unknown): string | null {
  const record = asRecord(error);
  const response = asRecord(record.response);
  const status = asRecord(response.status);
  const errorResult = asRecord(status.errorResult);
  const firstError = Array.isArray(record.errors) ? asRecord(record.errors[0]) : {};
  const candidates = [record.message, errorResult.message, firstError.message];
  const value = candidates.find(candidate => typeof candidate === 'string' && candidate.trim());
  return typeof value === 'string' ? value : null;
}

function normalizeCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function toDataQualityMappedError(error: unknown): DataQualityMappedError {
  const response = error instanceof HttpException ? error.getResponse() : error;
  const record = typeof response === 'string' ? {} : asRecord(response);
  const message =
    (typeof response === 'string' && response.trim() ? response : null) ??
    stringValue(record.message) ??
    explicitProviderErrorMessage(error) ??
    (error instanceof Error ? error.message : String(error));
  const details = asNullableDetails(record.details);
  return {
    code: stringValue(record.code),
    message,
    details,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNullableDetails(value: unknown): Record<string, unknown> | null {
  const details = asRecord(value);
  return Object.keys(details).length > 0 ? details : null;
}
