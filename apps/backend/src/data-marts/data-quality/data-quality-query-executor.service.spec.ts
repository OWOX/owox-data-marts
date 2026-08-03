import { HttpException } from '@nestjs/common';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { SqlRunBatch } from '../dto/domain/sql-run-batch.dto';
import { DataMart } from '../entities/data-mart.entity';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualityCompiledCheck } from './data-quality-check-compiler';
import { DataQualityQueryExecutorService } from './data-quality-query-executor.service';

describe('DataQualityQueryExecutorService', () => {
  const dataMart = {
    definition: { type: 'TABLE', fullyQualifiedName: 'dataset.table' },
    storage: {
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'project-123456', location: 'US' },
    },
  } as unknown as DataMart;

  function executableCheck(ruleKey: string, sql = `${ruleKey}-sql`): DataQualityCompiledCheck {
    return {
      kind: 'EXECUTABLE',
      strategy: 'COUNT',
      category: DataQualityCategory.EMPTY_TABLE,
      ruleKey,
      severity: DataQualitySeverity.ERROR,
      sql,
      resultShape: {
        exampleMarkerColumn: 'example_available',
        exampleColumns: [],
      },
    };
  }

  function createService(
    executeBatches: jest.Mock,
    mapError: (error: unknown) => unknown = error => error
  ) {
    const credentials = { token: 'resolved-once' };
    const credentialsResolver = { resolve: jest.fn().mockResolvedValue(credentials) };
    const sqlRunExecutorFacade = { executeBatches };
    const mapper = { toStorageReadError: jest.fn(mapError) };
    const errorMapperResolver = { resolve: jest.fn().mockResolvedValue(mapper) };
    const service = new DataQualityQueryExecutorService(
      credentialsResolver as never,
      sqlRunExecutorFacade as never,
      errorMapperResolver as never
    );
    return {
      service,
      credentials,
      credentialsResolver,
      mapper,
      errorMapperResolver,
    };
  }

  async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const results: T[] = [];
    for await (const result of iterable) results.push(result);
    return results;
  }

  it('executes exactly one SQL per executable check, sequentially, with rows and metadata', async () => {
    const executionOrder: string[] = [];
    const executeBatches = jest.fn((_type, _credentials, _config, _definition, sql: string) =>
      (async function* () {
        executionOrder.push(`start:${sql}`);
        yield new SqlRunBatch(
          [{ value: `${sql}:1` }],
          'next',
          ['value'],
          [{ name: 'value', label: 'VALUE', typeName: 'varchar' }]
        );
        await Promise.resolve();
        yield new SqlRunBatch([{ value: `${sql}:2` }], null, ['value']);
        executionOrder.push(`finish:${sql}`);
      })()
    );
    const { service, credentials, credentialsResolver, errorMapperResolver } =
      createService(executeBatches);

    const results = await collect(
      service.executeChecks(dataMart, [executableCheck('first'), executableCheck('second')])
    );

    expect(credentialsResolver.resolve).toHaveBeenCalledTimes(1);
    expect(credentialsResolver.resolve).toHaveBeenCalledWith(dataMart.storage);
    expect(errorMapperResolver.resolve).toHaveBeenCalledTimes(1);
    expect(executeBatches).toHaveBeenCalledTimes(2);
    expect(executeBatches.mock.calls[0]).toEqual([
      DataStorageType.GOOGLE_BIGQUERY,
      credentials,
      dataMart.storage.config,
      dataMart.definition,
      'first-sql',
    ]);
    expect(executionOrder).toEqual([
      'start:first-sql',
      'finish:first-sql',
      'start:second-sql',
      'finish:second-sql',
    ]);
    expect(results[0].execution).toEqual({
      sql: 'first-sql',
      rows: [{ value: 'first-sql:1' }, { value: 'first-sql:2' }],
      columnMetadata: [{ name: 'value', label: 'VALUE', typeName: 'varchar' }],
    });
  });

  it('maps a failed SQL and continues with the next check', async () => {
    const executeBatches = jest.fn((_type, _credentials, _config, _definition, sql: string) =>
      (async function* () {
        if (sql === 'broken') throw new Error('warehouse failed');
        yield new SqlRunBatch([{ violation_count: 0 }], null, ['violation_count']);
      })()
    );
    const mapped = new HttpException(
      {
        code: 'STORAGE_READ_FAILED',
        message: 'Mapped warehouse failure',
        details: { dependency: 'storage' },
      },
      424
    );
    const { service, mapper } = createService(executeBatches, () => mapped);

    const results = await collect(
      service.executeChecks(dataMart, [
        executableCheck('failed', 'broken'),
        executableCheck('later'),
      ])
    );

    expect(executeBatches.mock.calls.map(call => call[4])).toEqual(['broken', 'later-sql']);
    expect(mapper.toStorageReadError).toHaveBeenCalledWith(expect.any(Error), { force: true });
    expect(results[0].execution).toEqual({
      sql: 'broken',
      error: {
        code: 'STORAGE_READ_FAILED',
        message: 'Mapped warehouse failure',
        details: { dependency: 'storage' },
      },
    });
    expect(results[1].execution?.rows).toEqual([{ violation_count: 0 }]);
  });

  it('maps a provider AbortError when no cancellation was requested', async () => {
    const providerError = Object.assign(new Error('warehouse aborted the query'), {
      name: 'AbortError',
    });
    const executeBatches = jest.fn(() =>
      (async function* () {
        await Promise.reject(providerError);
        yield new SqlRunBatch([], null);
      })()
    );
    const { service, mapper } = createService(executeBatches);

    await expect(
      collect(service.executeChecks(dataMart, [executableCheck('failed')]))
    ).resolves.toEqual([
      {
        check: expect.objectContaining({ ruleKey: 'failed' }),
        execution: expect.objectContaining({
          sql: 'failed-sql',
          error: expect.objectContaining({ message: 'warehouse aborted the query' }),
        }),
      },
    ]);
    expect(mapper.toStorageReadError).toHaveBeenCalledWith(providerError, { force: true });
  });

  it('does not resolve credentials or execute SQL when already aborted', async () => {
    const executeBatches = jest.fn();
    const { service, credentialsResolver, mapper } = createService(executeBatches);
    const controller = new AbortController();
    controller.abort();

    await expect(
      collect(
        service.executeChecks(dataMart, [executableCheck('check')], {
          signal: controller.signal,
        })
      )
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(credentialsResolver.resolve).not.toHaveBeenCalled();
    expect(executeBatches).not.toHaveBeenCalled();
    expect(mapper.toStorageReadError).not.toHaveBeenCalled();
  });

  it('yields a completed check before observing cancellation between checks', async () => {
    const controller = new AbortController();
    const executeBatches = jest.fn((_type, _credentials, _config, _definition, sql: string) =>
      (async function* () {
        yield new SqlRunBatch([{ sql }], null, ['sql']);
        controller.abort();
      })()
    );
    const { service } = createService(executeBatches);
    const iterator = service
      .executeChecks(dataMart, [executableCheck('complete'), executableCheck('never')], {
        signal: controller.signal,
      })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        check: { ruleKey: 'complete' },
        execution: { sql: 'complete-sql', rows: [{ sql: 'complete-sql' }] },
      },
    });
    await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' });
    expect(executeBatches).toHaveBeenCalledTimes(1);
  });

  it('does not execute SQL for a compile-time NOT_APPLICABLE check', async () => {
    const executeBatches = jest.fn();
    const { service } = createService(executeBatches);
    const check: DataQualityCompiledCheck = {
      kind: 'NOT_APPLICABLE',
      category: DataQualityCategory.DUPLICATE_ROWS,
      ruleKey: 'duplicate_rows:data_mart',
      severity: DataQualitySeverity.ERROR,
      reason: 'Unsupported type',
      sql: null,
    };

    await expect(collect(service.executeChecks(dataMart, [check]))).resolves.toEqual([
      { check, execution: null },
    ]);
    expect(executeBatches).not.toHaveBeenCalled();
  });
});
