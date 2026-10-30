import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { BIGQUERY_AUTODETECT_LOCATION, BigQueryConfig } from '../schemas/bigquery-config.schema';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import { BigQueryCreateViewExecutor } from './bigquery-create-view.executor';
import { DataStorageCredentials } from '../../data-storage-credentials.type';

describe('BigQueryCreateViewExecutor', () => {
  const credentials: DataStorageCredentials = {
    type: 'service_account',
    project_id: 'test-project',
    private_key_id: 'key-id',
    private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    client_email: 'bot@example.com',
    client_id: 'client-id',
    client_x509_cert_url: 'https://example.com/cert',
  } as unknown as DataStorageCredentials;

  const sql = 'SELECT 1';
  const sqlHash = createHash('sha256').update(sql).digest('hex').slice(0, 32);
  const getMetadata = jest.fn();
  const mockAdapter = {
    executeDryRunQuery: jest.fn(),
    executeQuery: jest.fn(),
    createTableReference: jest.fn(() => ({ getMetadata })),
  };

  const mockAdapterFactory = {
    create: jest.fn(),
  } as unknown as jest.Mocked<BigQueryApiAdapterFactory>;

  let service: BigQueryCreateViewExecutor;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockAdapter.executeDryRunQuery.mockReset();
    mockAdapter.createTableReference.mockClear();
    getMetadata.mockReset();
    getMetadata.mockRejectedValue(Object.assign(new Error('Not found'), { code: 404 }));
    mockAdapter.executeQuery.mockReset();
    mockAdapter.executeQuery.mockResolvedValue({ jobId: 'job-id' });
    mockAdapter.executeDryRunQuery.mockResolvedValue({
      totalBytesProcessed: 0,
      location: 'EU',
    });

    (mockAdapterFactory.create as jest.Mock).mockReset();
    (mockAdapterFactory.create as jest.Mock).mockReturnValue(mockAdapter);
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    service = new BigQueryCreateViewExecutor(mockAdapterFactory);
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
  });

  it('should skip dry run when location is explicitly configured', async () => {
    const config: BigQueryConfig = { projectId: 'test-project', location: 'EU' };

    const result = await service.createView(credentials, config, 'my_view', sql);

    expect(mockAdapter.executeDryRunQuery).not.toHaveBeenCalled();
    expect(mockAdapterFactory.create).toHaveBeenCalledWith(credentials, config);
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      "CREATE SCHEMA IF NOT EXISTS `test-project.owox_internal_eu` OPTIONS(location='EU')"
    );
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      `CREATE OR REPLACE VIEW \`test-project.owox_internal_eu.my_view\` OPTIONS(labels=[('owox_sql_hash', '${sqlHash}')]) AS SELECT 1`
    );
    expect(result).toEqual({ fullyQualifiedName: 'test-project.owox_internal_eu.my_view' });
  });

  it('should skip the DDL when the view was created from the same SQL', async () => {
    getMetadata.mockResolvedValue([{ labels: { owox_sql_hash: sqlHash } }]);
    const config: BigQueryConfig = { projectId: 'test-project', location: 'EU' };

    const result = await service.createView(credentials, config, 'my_view', sql);

    expect(mockAdapter.createTableReference).toHaveBeenCalledWith(
      'test-project',
      'owox_internal_eu',
      'my_view'
    );
    expect(mockAdapter.executeQuery).not.toHaveBeenCalled();
    expect(result).toEqual({ fullyQualifiedName: 'test-project.owox_internal_eu.my_view' });
  });

  it('should replace the view when it was created from other SQL', async () => {
    getMetadata.mockResolvedValue([{ labels: { owox_sql_hash: 'other' } }]);
    const config: BigQueryConfig = { projectId: 'test-project', location: 'EU' };

    await service.createView(credentials, config, 'my_view', sql);

    expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('CREATE OR REPLACE VIEW')
    );
  });

  it('should run one DDL for concurrent calls with the same SQL', async () => {
    const config: BigQueryConfig = { projectId: 'test-project', location: 'EU' };

    await Promise.all(
      Array.from({ length: 5 }, () => service.createView(credentials, config, 'my_view', sql))
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(2);
  });

  describe('when BigQuery rate-limits the view DDL', () => {
    const config: BigQueryConfig = { projectId: 'test-project', location: 'EU' };
    const rateLimited = new Error(
      'Exceeded rate limits: too many table update operations for this table.'
    );

    beforeEach(() => {
      jest.useFakeTimers();
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ jobId: 'schema-job' })
        .mockRejectedValueOnce(rateLimited);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should succeed when another instance has written the same SQL', async () => {
      getMetadata
        .mockRejectedValueOnce(Object.assign(new Error('Not found'), { code: 404 }))
        .mockResolvedValueOnce([{ labels: { owox_sql_hash: sqlHash } }]);

      const result = service.createView(credentials, config, 'my_view', sql);
      await jest.advanceTimersByTimeAsync(2000);

      await expect(result).resolves.toEqual({
        fullyQualifiedName: 'test-project.owox_internal_eu.my_view',
      });
      expect(getMetadata).toHaveBeenCalledTimes(2);
    });

    it('should rethrow when the view still holds other SQL', async () => {
      getMetadata.mockResolvedValue([{ labels: { owox_sql_hash: 'other' } }]);

      const result = service.createView(credentials, config, 'my_view', sql);
      const assertion = expect(result).rejects.toBe(rateLimited);
      await jest.advanceTimersByTimeAsync(2000);

      await assertion;
      expect(getMetadata).toHaveBeenCalledTimes(2);
    });
  });

  it('should rethrow other DDL errors without reading the view again', async () => {
    const syntaxError = new Error('Syntax error: Unexpected keyword');
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ jobId: 'schema-job' })
      .mockRejectedValueOnce(syntaxError);
    const config: BigQueryConfig = { projectId: 'test-project', location: 'EU' };

    await expect(service.createView(credentials, config, 'my_view', sql)).rejects.toBe(syntaxError);
    expect(getMetadata).toHaveBeenCalledTimes(1);
  });

  it('should warn and run the DDL when the view labels cannot be read', async () => {
    getMetadata.mockRejectedValue(Object.assign(new Error('Access Denied'), { code: 403 }));
    const config: BigQueryConfig = { projectId: 'test-project', location: 'EU' };

    await service.createView(credentials, config, 'my_view', sql);

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot read BigQuery view labels')
    );
    expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('CREATE OR REPLACE VIEW')
    );
  });

  it('should not remember a failed refresh', async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(new Error('rateLimitExceeded'));
    const config: BigQueryConfig = { projectId: 'test-project', location: 'EU' };

    await expect(service.createView(credentials, config, 'my_view', sql)).rejects.toThrow(
      'rateLimitExceeded'
    );
    await service.createView(credentials, config, 'my_view', sql);

    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(3);
  });

  it('should execute dry run first when location is AUTODETECT', async () => {
    const config: BigQueryConfig = {
      projectId: 'test-project',
      location: BIGQUERY_AUTODETECT_LOCATION,
    };

    await service.createView(credentials, config, 'my_view', sql);

    expect(mockAdapter.executeDryRunQuery).toHaveBeenCalledTimes(1);
    expect(mockAdapter.executeDryRunQuery).toHaveBeenCalledWith(sql);
    expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(2);
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      "CREATE SCHEMA IF NOT EXISTS `test-project.owox_internal_eu` OPTIONS(location='EU')"
    );
    expect(mockAdapter.executeDryRunQuery.mock.invocationCallOrder[0]).toBeLessThan(
      mockAdapter.executeQuery.mock.invocationCallOrder[0]
    );
  });

  it('should default missing location to AUTODETECT and execute dry run', async () => {
    const configWithoutLocation = { projectId: 'test-project' } as unknown as BigQueryConfig;

    await service.createView(credentials, configWithoutLocation, 'my_view', sql);

    expect(mockAdapterFactory.create).toHaveBeenCalledWith(credentials, {
      projectId: 'test-project',
      location: BIGQUERY_AUTODETECT_LOCATION,
    });
    expect(mockAdapter.executeDryRunQuery).toHaveBeenCalledWith(sql);
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      "CREATE SCHEMA IF NOT EXISTS `test-project.owox_internal_eu` OPTIONS(location='EU')"
    );
  });

  it('should execute dry run when location is empty', async () => {
    const configWithEmptyLocation = { projectId: 'test-project', location: '' } as BigQueryConfig;

    await service.createView(credentials, configWithEmptyLocation, 'my_view', sql);

    expect(mockAdapter.executeDryRunQuery).toHaveBeenCalledWith(sql);
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      "CREATE SCHEMA IF NOT EXISTS `test-project.owox_internal_eu` OPTIONS(location='EU')"
    );
  });

  it('should execute dry run when location is null', async () => {
    const configWithNullLocation = {
      projectId: 'test-project',
      location: null,
    } as unknown as BigQueryConfig;

    await service.createView(credentials, configWithNullLocation, 'my_view', sql);

    expect(mockAdapterFactory.create).toHaveBeenCalledWith(credentials, {
      projectId: 'test-project',
      location: BIGQUERY_AUTODETECT_LOCATION,
    });
    expect(mockAdapter.executeDryRunQuery).toHaveBeenCalledWith(sql);
  });

  it('should normalize location in internal dataset name', async () => {
    mockAdapter.executeDryRunQuery.mockResolvedValueOnce({
      totalBytesProcessed: 0,
      location: 'us-central1',
    });

    const config: BigQueryConfig = {
      projectId: 'test-project',
      location: BIGQUERY_AUTODETECT_LOCATION,
    };

    const result = await service.createView(credentials, config, 'my_view', sql);

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      "CREATE SCHEMA IF NOT EXISTS `test-project.owox_internal_us_central1` OPTIONS(location='us-central1')"
    );
    expect(result).toEqual({
      fullyQualifiedName: 'test-project.owox_internal_us_central1.my_view',
    });
  });

  it('should fallback to US when dry run location cannot be resolved', async () => {
    mockAdapter.executeDryRunQuery.mockResolvedValueOnce({
      totalBytesProcessed: 0,
      location: undefined,
    });

    const config: BigQueryConfig = {
      projectId: 'test-project',
      location: BIGQUERY_AUTODETECT_LOCATION,
    };

    const result = await service.createView(credentials, config, 'my_view', sql);

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'BigQuery dry run did not return location. Use default location US.'
    );
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      "CREATE SCHEMA IF NOT EXISTS `test-project.owox_internal_us` OPTIONS(location='US')"
    );
    expect(result).toEqual({
      fullyQualifiedName: 'test-project.owox_internal_us.my_view',
    });
  });

  describe('managed credentials', () => {
    const managed = {
      type: 'bigquery_managed',
      authClient: {},
      serviceAccountEmail: 'sa@p.iam.gserviceaccount.com',
      datasetId: 'owox_abc',
      internalDatasetId: 'owox_abc_internal',
      scanBudget: {},
    } as unknown as DataStorageCredentials;
    const config: BigQueryConfig = { projectId: 'proj-abc', location: 'US' };
    const executeViewDdl = jest.fn();

    beforeEach(() => {
      executeViewDdl.mockReset().mockResolvedValue(undefined);
      (mockAdapterFactory.create as jest.Mock).mockReturnValue({ ...mockAdapter, executeViewDdl });
      mockAdapter.executeDryRunQuery.mockResolvedValue({ statementType: 'SELECT' });
    });

    it("builds a managed storage's view in its internal dataset without CREATE SCHEMA", async () => {
      const result = await service.createView(managed, config, 'v', sql);

      expect(executeViewDdl).toHaveBeenCalledWith(
        'CREATE OR REPLACE VIEW `proj-abc.owox_abc_internal.v` AS SELECT 1'
      );
      expect(mockAdapter.executeQuery).not.toHaveBeenCalled();
      expect(result).toEqual({ fullyQualifiedName: 'proj-abc.owox_abc_internal.v' });
    });

    it('refuses a view over a script', async () => {
      mockAdapter.executeDryRunQuery.mockResolvedValue({ statementType: 'SCRIPT' });

      await expect(
        service.createView(managed, config, 'v', 'SELECT 1; DROP TABLE t')
      ).rejects.toThrow('SELECT queries only');
      expect(executeViewDdl).not.toHaveBeenCalled();
    });

    it('refuses a qualified view name', async () => {
      await expect(service.createView(managed, config, 'a.b.c', sql)).rejects.toThrow(Error);
      expect(executeViewDdl).not.toHaveBeenCalled();
    });
  });
});
