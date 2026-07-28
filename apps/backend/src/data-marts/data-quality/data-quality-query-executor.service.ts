import { HttpException, Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataStorageCredentialsResolver } from '../data-storage-types/data-storage-credentials-resolver.service';
import { DATA_STORAGE_ERROR_MAPPER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { SqlRunExecutorFacade } from '../data-storage-types/facades/sql-run-executor.facade';
import { DataStorageErrorMapper } from '../data-storage-types/interfaces/data-storage-error-mapper.interface';
import { DataQualityMappedError } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataMart } from '../entities/data-mart.entity';
import { DataQualityCompiledCheck } from './data-quality-check-compiler';
import type { DataQualityQueryExecution } from './data-quality-result-parser';

interface DataQualityExecutedCheck {
  check: DataQualityCompiledCheck;
  execution: DataQualityQueryExecution | null;
}

interface DataQualityQueryExecutionOptions {
  signal?: AbortSignal;
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
      let execution: DataQualityQueryExecution | null = null;

      if (check.kind === 'EXECUTABLE') {
        try {
          execution = await this.executeQuery(dataMart, credentials, check.sql);
        } catch (error) {
          signal?.throwIfAborted();

          execution = {
            sql: check.sql,
            error: toDataQualityMappedError(
              errorMapper.toStorageReadError(error, {
                force: true,
              })
            ),
          };
        }
      }

      yield { check, execution };
    }
  }

  private async executeQuery(
    dataMart: DataMart,
    credentials: Parameters<SqlRunExecutorFacade['executeBatches']>[1],
    sql: string
  ): Promise<DataQualityQueryExecution> {
    const rows: Record<string, unknown>[] = [];
    let columnMetadata: DataQualityQueryExecution['columnMetadata'];

    for await (const batch of this.sqlRunExecutorFacade.executeBatches(
      dataMart.storage.type,
      credentials,
      dataMart.storage.config!,
      dataMart.definition!,
      sql
    )) {
      rows.push(...batch.rows);
      if (!columnMetadata && batch.columnMetadata) {
        columnMetadata = batch.columnMetadata;
      }
    }

    return {
      sql,
      rows,
      ...(columnMetadata ? { columnMetadata } : {}),
    };
  }
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
