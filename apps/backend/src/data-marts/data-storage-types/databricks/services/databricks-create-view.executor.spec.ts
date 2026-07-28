import { DatabricksAuthMethod } from '../enums/databricks-auth-method.enum';
import { DatabricksApiAdapterFactory } from '../adapters/databricks-api-adapter.factory';
import { DatabricksCreateViewExecutor } from './databricks-create-view.executor';

describe('DatabricksCreateViewExecutor', () => {
  const adapter = {
    executeQueryAndFetchAll: jest.fn(),
    createView: jest.fn(),
    destroy: jest.fn(),
  };
  const service = new DatabricksCreateViewExecutor({
    create: jest.fn(() => adapter),
  } as unknown as DatabricksApiAdapterFactory);

  beforeEach(() => {
    jest.clearAllMocks();
    adapter.executeQueryAndFetchAll.mockResolvedValue([
      { catalog_name: 'main', schema_name: 'analytics' },
    ]);
    adapter.createView.mockResolvedValue(undefined);
    adapter.destroy.mockResolvedValue(undefined);
  });

  it('returns the active catalog and schema for a Data Quality snapshot view', async () => {
    const result = await service.createView(
      {
        authMethod: DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN,
        token: 'token',
      },
      { host: 'workspace.databricks.com', httpPath: '/sql/warehouse' },
      'dq_run_source',
      'SELECT 1',
      { requireFullyQualifiedName: true }
    );

    expect(adapter.executeQueryAndFetchAll).toHaveBeenCalledWith(
      'SELECT current_catalog() AS catalog_name, current_schema() AS schema_name'
    );
    expect(adapter.createView).toHaveBeenCalledWith(
      '`main`.`analytics`.`dq_run_source`',
      'SELECT 1'
    );
    expect(result).toEqual({ fullyQualifiedName: 'main.analytics.dq_run_source' });
  });
});
