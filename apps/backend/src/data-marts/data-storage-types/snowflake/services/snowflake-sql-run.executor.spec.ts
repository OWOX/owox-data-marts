import { SnowflakeAuthMethod } from '../enums/snowflake-auth-method.enum';
import { SnowflakeSqlRunExecutor } from './snowflake-sql-run.executor';

describe('SnowflakeSqlRunExecutor', () => {
  it('forwards the abort signal to the active Snowflake query', async () => {
    const adapter = {
      executeQuery: jest.fn().mockResolvedValue({ rows: [], metadata: { columns: [] } }),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    const adapterFactory = { create: jest.fn().mockReturnValue(adapter) };
    const queryBuilder = { buildQuery: jest.fn() };
    const executor = new SnowflakeSqlRunExecutor(adapterFactory as never, queryBuilder as never);
    const controller = new AbortController();

    for await (const _batch of executor.execute(
      { authMethod: SnowflakeAuthMethod.PASSWORD, username: 'user', password: 'password' },
      { account: 'account', warehouse: 'warehouse' },
      {} as never,
      'SELECT 1',
      { signal: controller.signal }
    )) {
      // consume generator
    }

    expect(adapter.executeQuery).toHaveBeenCalledWith(
      'SELECT 1',
      false,
      undefined,
      controller.signal
    );
  });
});
