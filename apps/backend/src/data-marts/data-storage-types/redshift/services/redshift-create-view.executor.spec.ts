import { RedshiftConnectionType } from '../enums/redshift-connection-type.enum';
import { RedshiftApiAdapterFactory } from '../adapters/redshift-api-adapter.factory';
import { RedshiftCreateViewExecutor } from './redshift-create-view.executor';

describe('RedshiftCreateViewExecutor', () => {
  const adapter = {
    executeQuery: jest.fn(),
    waitForQueryToComplete: jest.fn(),
  };
  const service = new RedshiftCreateViewExecutor({
    create: jest.fn(() => adapter),
  } as unknown as RedshiftApiAdapterFactory);

  beforeEach(() => {
    jest.clearAllMocks();
    adapter.executeQuery.mockResolvedValue({ statementId: 'statement-1' });
    adapter.waitForQueryToComplete.mockResolvedValue(undefined);
  });

  it('returns a stable qualified reference for a Data Quality snapshot view', async () => {
    const result = await service.createView(
      { accessKeyId: 'key', secretAccessKey: 'secret' },
      {
        connectionType: RedshiftConnectionType.SERVERLESS,
        region: 'eu-central-1',
        database: 'analytics',
        workgroupName: 'warehouse',
      },
      'dq_run_source',
      'SELECT 1',
      { requireFullyQualifiedName: true }
    );

    expect(adapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      'CREATE SCHEMA IF NOT EXISTS "owox_internal"'
    );
    expect(adapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      'CREATE OR REPLACE VIEW "owox_internal"."dq_run_source" AS SELECT 1'
    );
    expect(result).toEqual({ fullyQualifiedName: 'owox_internal.dq_run_source' });
  });
});
