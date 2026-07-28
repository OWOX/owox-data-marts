import { AthenaApiAdapterFactory } from '../adapters/athena-api-adapter.factory';
import { S3ApiAdapterFactory } from '../adapters/s3-api-adapter.factory';
import { AthenaCreateViewExecutor } from './athena-create-view.executor';

describe('AthenaCreateViewExecutor', () => {
  const athena = {
    executeQuery: jest.fn(),
    waitForQueryToComplete: jest.fn(),
  };
  const s3 = {
    cleanupOutputFiles: jest.fn(),
  };
  const service = new AthenaCreateViewExecutor(
    { create: jest.fn(() => athena) } as unknown as AthenaApiAdapterFactory,
    { create: jest.fn(() => s3) } as unknown as S3ApiAdapterFactory
  );

  beforeEach(() => {
    jest.clearAllMocks();
    athena.executeQuery.mockResolvedValue({ queryExecutionId: 'query-1' });
    athena.waitForQueryToComplete.mockResolvedValue(undefined);
    s3.cleanupOutputFiles.mockResolvedValue(undefined);
  });

  it('returns a stable qualified reference for a Data Quality snapshot view', async () => {
    const result = await service.createView(
      { accessKeyId: 'key', secretAccessKey: 'secret' },
      { region: 'eu-central-1', outputBucket: 'results' },
      'dq_run_source',
      'SELECT 1',
      { requireFullyQualifiedName: true }
    );

    expect(athena.executeQuery).toHaveBeenCalledWith(
      'CREATE OR REPLACE VIEW "default"."dq_run_source" AS SELECT 1',
      'results',
      expect.stringContaining('owox-data-marts/ddl/')
    );
    expect(result).toEqual({ fullyQualifiedName: 'default.dq_run_source' });
  });
});
