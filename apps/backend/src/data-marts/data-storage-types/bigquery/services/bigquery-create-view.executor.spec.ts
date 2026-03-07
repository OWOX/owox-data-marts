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
  const mockAdapter = {
    executeDryRunQuery: jest.fn(),
    executeQuery: jest.fn(),
  };

  const mockAdapterFactory = {
    create: jest.fn(),
  } as unknown as jest.Mocked<BigQueryApiAdapterFactory>;

  let service: BigQueryCreateViewExecutor;

  beforeEach(() => {
    mockAdapter.executeDryRunQuery.mockReset();
    mockAdapter.executeQuery.mockReset();
    mockAdapter.executeQuery.mockResolvedValue({ jobId: 'job-id' });
    mockAdapter.executeDryRunQuery.mockResolvedValue({
      totalBytesProcessed: 0,
      location: 'EU',
    });

    (mockAdapterFactory.create as jest.Mock).mockReset();
    (mockAdapterFactory.create as jest.Mock).mockReturnValue(mockAdapter);

    service = new BigQueryCreateViewExecutor(mockAdapterFactory);
  });

  it('should skip dry run when location is explicitly configured', async () => {
    const config: BigQueryConfig = { projectId: 'test-project', location: 'EU' };

    const result = await service.createView(credentials, config, 'my_view', sql);

    expect(mockAdapter.executeDryRunQuery).not.toHaveBeenCalled();
    expect(mockAdapterFactory.create).toHaveBeenCalledWith(credentials, config);
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      "CREATE SCHEMA IF NOT EXISTS `test-project.owox_internal` OPTIONS(location='EU')"
    );
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      'CREATE OR REPLACE VIEW `test-project.owox_internal.my_view` AS SELECT 1'
    );
    expect(result).toEqual({ fullyQualifiedName: 'test-project.owox_internal.my_view' });
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
      "CREATE SCHEMA IF NOT EXISTS `test-project.owox_internal` OPTIONS(location='EU')"
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
      "CREATE SCHEMA IF NOT EXISTS `test-project.owox_internal` OPTIONS(location='EU')"
    );
  });
});
