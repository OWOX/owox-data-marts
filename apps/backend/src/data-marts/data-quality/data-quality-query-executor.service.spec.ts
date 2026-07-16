import { HttpException } from '@nestjs/common';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { wrapProviderError } from '../data-storage-types/utils/provider-error.utils';
import { SqlRunBatch } from '../dto/domain/sql-run-batch.dto';
import { DataMart } from '../entities/data-mart.entity';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualityCompiledCheck, DataQualityQueryPurpose } from './data-quality-check-compiler';
import { DataQualityQueryExecutorService } from './data-quality-query-executor.service';

describe('DataQualityQueryExecutorService', () => {
  const dataMart = {
    definition: { type: 'TABLE', fullyQualifiedName: 'dataset.table' },
    storage: {
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'project-123456', location: 'US' },
    },
  } as unknown as DataMart;

  function executableCheck(
    ruleKey: string,
    queries: Array<{ purpose: DataQualityQueryPurpose; sql: string }>
  ): DataQualityCompiledCheck {
    return {
      kind: 'EXECUTABLE',
      strategy: 'COUNT',
      category: DataQualityCategory.EMPTY_TABLE,
      ruleKey,
      severity: DataQualitySeverity.ERROR,
      queries,
      reproductionSql: `-- ${ruleKey}`,
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

  it('resolves credentials once and executes every query sequentially with rows and metadata', async () => {
    const executionOrder: string[] = [];
    const executeBatches = jest.fn(
      (_type, _credentials, _config, _definition, sql: string, options) =>
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
          expect(options.signal).toBeUndefined();
        })()
    );
    const { service, credentials, credentialsResolver, errorMapperResolver } =
      createService(executeBatches);
    const checks = [
      executableCheck('first', [
        { purpose: DataQualityQueryPurpose.MEASUREMENT, sql: 'first-sql' },
        { purpose: DataQualityQueryPurpose.EXAMPLES, sql: 'first-examples' },
      ]),
      executableCheck('second', [
        { purpose: DataQualityQueryPurpose.MEASUREMENT, sql: 'second-sql' },
      ]),
    ];

    const results = await collect(service.executeChecks(dataMart, checks));

    expect(credentialsResolver.resolve).toHaveBeenCalledTimes(1);
    expect(credentialsResolver.resolve).toHaveBeenCalledWith(dataMart.storage);
    expect(errorMapperResolver.resolve).toHaveBeenCalledTimes(1);
    expect(executeBatches).toHaveBeenCalledTimes(3);
    expect(executeBatches.mock.calls[0]).toEqual([
      DataStorageType.GOOGLE_BIGQUERY,
      credentials,
      dataMart.storage.config,
      dataMart.definition,
      'first-sql',
      { signal: undefined },
    ]);
    expect(executionOrder).toEqual([
      'start:first-sql',
      'finish:first-sql',
      'start:first-examples',
      'finish:first-examples',
      'start:second-sql',
      'finish:second-sql',
    ]);
    expect(results[0].executions[0]).toEqual({
      purpose: DataQualityQueryPurpose.MEASUREMENT,
      sql: 'first-sql',
      rows: [{ value: 'first-sql:1' }, { value: 'first-sql:2' }],
      columnMetadata: [{ name: 'value', label: 'VALUE', typeName: 'varchar' }],
    });
  });

  it('stops the failed rule, maps its error, and continues with later rules', async () => {
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
    const checks = [
      executableCheck('failed', [
        { purpose: DataQualityQueryPurpose.MEASUREMENT, sql: 'broken' },
        { purpose: DataQualityQueryPurpose.EXAMPLES, sql: 'must-not-run' },
      ]),
      executableCheck('later', [
        { purpose: DataQualityQueryPurpose.MEASUREMENT, sql: 'later-sql' },
      ]),
    ];

    const results = await collect(service.executeChecks(dataMart, checks));

    expect(executeBatches.mock.calls.map(call => call[4])).toEqual(['broken', 'later-sql']);
    expect(mapper.toStorageReadError).toHaveBeenCalledWith(expect.any(Error), { force: true });
    expect(results[0].executions).toEqual([
      {
        purpose: DataQualityQueryPurpose.MEASUREMENT,
        sql: 'broken',
        error: {
          code: 'STORAGE_READ_FAILED',
          message: 'Mapped warehouse failure',
          details: { dependency: 'storage' },
        },
      },
    ]);
    expect(results[1].executions[0].rows).toEqual([{ violation_count: 0 }]);
  });

  it('skips an optional examples query when the lifecycle predicate says the check passed', async () => {
    const executeBatches = jest.fn((_type, _credentials, _config, _definition, _sql: string) =>
      (async function* () {
        yield new SqlRunBatch([{ violation_count: 0 }], null, ['violation_count']);
      })()
    );
    const { service } = createService(executeBatches);
    const check = executableCheck('passed', [
      { purpose: DataQualityQueryPurpose.MEASUREMENT, sql: 'measurement' },
      { purpose: DataQualityQueryPurpose.EXAMPLES, sql: 'examples-must-not-run' },
    ]);
    const shouldExecuteQuery = jest.fn(
      (_check, query: { purpose: DataQualityQueryPurpose }) =>
        query.purpose !== DataQualityQueryPurpose.EXAMPLES
    );

    const [result] = await collect(
      service.executeChecks(dataMart, [check], { shouldExecuteQuery })
    );

    expect(executeBatches.mock.calls.map(call => call[4])).toEqual(['measurement']);
    expect(shouldExecuteQuery).toHaveBeenCalledTimes(2);
    expect(result.executions).toHaveLength(1);
  });

  it('checks execution ownership before each SQL statement and propagates a lost fence', async () => {
    const executeBatches = jest.fn((_type, _credentials, _config, _definition, sql: string) =>
      (async function* () {
        yield new SqlRunBatch([{ sql }], null, ['sql']);
      })()
    );
    const { service, mapper } = createService(executeBatches);
    const ownershipError = Object.assign(new Error('execution lease was lost'), {
      name: 'TriggerExecutionOwnershipError',
    });
    const beforeExecuteQuery = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(ownershipError);
    const check = executableCheck('guarded', [
      { purpose: DataQualityQueryPurpose.MEASUREMENT, sql: 'first-sql' },
      { purpose: DataQualityQueryPurpose.EXAMPLES, sql: 'second-sql' },
    ]);

    await expect(
      collect(service.executeChecks(dataMart, [check], { beforeExecuteQuery }))
    ).rejects.toBe(ownershipError);

    expect(beforeExecuteQuery).toHaveBeenCalledTimes(2);
    expect(executeBatches.mock.calls.map(call => call[4])).toEqual(['first-sql']);
    expect(mapper.toStorageReadError).not.toHaveBeenCalled();
  });

  it('does not resolve credentials or execute SQL when already aborted', async () => {
    const executeBatches = jest.fn();
    const { service, credentialsResolver, mapper } = createService(executeBatches);
    const controller = new AbortController();
    controller.abort();

    await expect(
      collect(
        service.executeChecks(
          dataMart,
          [
            executableCheck('check', [
              { purpose: DataQualityQueryPurpose.MEASUREMENT, sql: 'never' },
            ]),
          ],
          { signal: controller.signal }
        )
      )
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(credentialsResolver.resolve).not.toHaveBeenCalled();
    expect(executeBatches).not.toHaveBeenCalled();
    expect(mapper.toStorageReadError).not.toHaveBeenCalled();
  });

  it('yields a successfully completed query after cooperative cancellation and stops before later SQL', async () => {
    const controller = new AbortController();
    const executeBatches = jest.fn((_type, _credentials, _config, _definition, sql: string) =>
      (async function* () {
        yield new SqlRunBatch([{ sql }], null, ['sql']);
        if (sql === 'abort-after') controller.abort();
      })()
    );
    const { service, mapper } = createService(executeBatches);
    const iterator = service
      .executeChecks(
        dataMart,
        [
          executableCheck('complete', [
            { purpose: DataQualityQueryPurpose.MEASUREMENT, sql: 'complete' },
          ]),
          executableCheck('cancelled', [
            { purpose: DataQualityQueryPurpose.MEASUREMENT, sql: 'abort-after' },
            { purpose: DataQualityQueryPurpose.EXAMPLES, sql: 'never-after-abort' },
          ]),
          executableCheck('later', [
            { purpose: DataQualityQueryPurpose.MEASUREMENT, sql: 'never-later-check' },
          ]),
        ],
        { signal: controller.signal }
      )
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { check: { ruleKey: 'complete' } },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        check: { ruleKey: 'cancelled' },
        executions: [
          {
            purpose: DataQualityQueryPurpose.MEASUREMENT,
            sql: 'abort-after',
            rows: [{ sql: 'abort-after' }],
          },
        ],
      },
    });
    await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' });

    expect(executeBatches.mock.calls.map(call => call[4])).toEqual(['complete', 'abort-after']);
    expect(mapper.toStorageReadError).not.toHaveBeenCalled();
  });

  it('propagates cancellation when the SQL executor itself aborts the query', async () => {
    const controller = new AbortController();
    const executeBatches = jest.fn(() =>
      (async function* () {
        controller.abort();
        controller.signal.throwIfAborted();
        yield new SqlRunBatch([], null, []);
      })()
    );
    const { service, mapper } = createService(executeBatches);
    const check = executableCheck('cancelled', [
      { purpose: DataQualityQueryPurpose.MEASUREMENT, sql: 'abort-in-executor' },
    ]);

    await expect(
      collect(service.executeChecks(dataMart, [check], { signal: controller.signal }))
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(mapper.toStorageReadError).not.toHaveBeenCalled();
  });

  it('classifies explicit metadata-unavailable provider errors before generic mapping', async () => {
    const executeBatches = jest.fn(() =>
      (async function* () {
        yield new SqlRunBatch([], null, []);
        throw { errors: [{ reason: 'notFound', message: 'table metadata is unavailable' }] };
      })()
    );
    const { service, mapper } = createService(executeBatches, () => new Error('generic'));
    const check = executableCheck('freshness', [
      { purpose: DataQualityQueryPurpose.METADATA_FRESHNESS, sql: 'metadata-sql' },
    ]);

    const [result] = await collect(service.executeChecks(dataMart, [check]));

    expect(result.executions[0].error).toEqual({
      code: 'METADATA_UNAVAILABLE',
      message: 'table metadata is unavailable',
      details: null,
    });
    expect(mapper.toStorageReadError).not.toHaveBeenCalled();
  });

  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, { reason: 'notFound' }],
    [DataStorageType.SNOWFLAKE, { code: '002003' }],
    [DataStorageType.DATABRICKS, { errorCode: 'TABLE_OR_VIEW_NOT_FOUND' }],
  ])(
    'classifies a provider identity preserved on a wrapped %s error as metadata unavailable',
    async (storageType, identity) => {
      const providerError = Object.assign(new Error('Provider metadata error'), identity);
      const wrappedError = wrapProviderError('Wrapped provider metadata error', providerError);
      const executeBatches = jest.fn(() =>
        (async function* () {
          yield new SqlRunBatch([], null, []);
          throw wrappedError;
        })()
      );
      const { service, mapper } = createService(executeBatches, () => new Error('generic'));
      const check = executableCheck('freshness', [
        { purpose: DataQualityQueryPurpose.METADATA_FRESHNESS, sql: 'metadata-sql' },
      ]);
      const providerDataMart = {
        ...dataMart,
        storage: { ...dataMart.storage, type: storageType },
      } as DataMart;

      const [result] = await collect(service.executeChecks(providerDataMart, [check]));

      expect(result.executions[0].error).toEqual({
        code: 'METADATA_UNAVAILABLE',
        message: 'Wrapped provider metadata error',
        details: null,
      });
      expect(mapper.toStorageReadError).not.toHaveBeenCalled();
    }
  );
});
