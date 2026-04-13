import { DatabricksAuthMethod } from '../enums/databricks-auth-method.enum';
import { DatabricksApiAdapter } from './databricks-api.adapter';

describe('DatabricksApiAdapter', () => {
  const credentials = {
    authMethod: DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN,
    token: 'token',
  };

  const config = {
    host: 'host',
    httpPath: '/sql/warehouse',
  };

  it('fails fast when executeQuery gets an empty chunk while cursor reports more rows', async () => {
    const cursor = {
      queryId: 'query-1',
      fetchChunk: jest.fn().mockResolvedValue([]),
      hasMoreRows: jest.fn().mockResolvedValue(true),
      getColumns: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = new DatabricksApiAdapter(credentials, config);
    jest.spyOn(adapter, 'openQueryCursor').mockResolvedValue(cursor);

    await expect(adapter.executeQuery('SELECT 1')).rejects.toThrow(
      'Databricks cursor returned an empty chunk while indicating more rows'
    );
    expect(cursor.close).toHaveBeenCalledTimes(1);
  });

  it('fails fast when fetchResults gets an empty chunk while cursor reports more rows', async () => {
    const cursor = {
      queryId: 'query-2',
      fetchChunk: jest.fn().mockResolvedValue([]),
      hasMoreRows: jest.fn().mockResolvedValue(true),
      getColumns: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = new DatabricksApiAdapter(credentials, config);
    jest.spyOn(adapter, 'openQueryCursor').mockResolvedValue(cursor);

    await expect(adapter.fetchResults('SELECT 1', 10)).rejects.toThrow(
      'Databricks cursor returned an empty chunk while indicating more rows'
    );
    expect(cursor.close).toHaveBeenCalledTimes(1);
  });
});
