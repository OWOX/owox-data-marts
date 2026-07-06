import { SnowflakeApiAdapter } from './snowflake-api.adapter';
import { SnowflakeAuthMethod } from '../enums/snowflake-auth-method.enum';

const mockConnection = {
  isUp: jest.fn().mockReturnValue(true),
  connect: jest.fn((cb: (e: Error | null) => void) => cb(null)),
  execute: jest.fn(),
  destroy: jest.fn((cb: (e: Error | null) => void) => cb(null)),
};

jest.mock('snowflake-sdk', () => ({
  configure: jest.fn(),
  createConnection: jest.fn(() => mockConnection),
}));

describe('SnowflakeApiAdapter STATEMENT_TIMEOUT_IN_SECONDS (Phase 3)', () => {
  const stmt = {
    getColumns: () => [],
    getQueryId: () => 'q1',
  };

  const createAdapter = () => {
    mockConnection.execute.mockImplementation((opts: { complete: (...a: unknown[]) => void }) =>
      opts.complete(null, stmt, [])
    );
    return new SnowflakeApiAdapter(
      { authMethod: SnowflakeAuthMethod.PASSWORD, username: 'u', password: 'p' } as never,
      { account: 'a', warehouse: 'w' } as never
    );
  };

  beforeEach(() => jest.clearAllMocks());

  it('adds parameters.STATEMENT_TIMEOUT_IN_SECONDS (ms→s) when a timeout is passed', async () => {
    const adapter = createAdapter();

    await adapter.executeQuery('SELECT 1', false, 30000);

    expect(mockConnection.execute.mock.calls[0][0]).toMatchObject({
      parameters: { STATEMENT_TIMEOUT_IN_SECONDS: 30 },
    });
  });

  it('rounds a sub-second remainder up (1500ms → 2s)', async () => {
    const adapter = createAdapter();

    await adapter.executeQuery('SELECT 1', false, 1500);

    expect(mockConnection.execute.mock.calls[0][0].parameters).toEqual({
      STATEMENT_TIMEOUT_IN_SECONDS: 2,
    });
  });

  it('omits parameters entirely when no timeout is passed (regression)', async () => {
    const adapter = createAdapter();

    await adapter.executeQuery('SELECT 1');

    expect(mockConnection.execute.mock.calls[0][0]).not.toHaveProperty('parameters');
  });

  it('cancels the running statement when the abort signal fires', async () => {
    // execute stays pending until cancel fires the complete callback (like a real cancelled query).
    let complete!: (e: Error | null, s: unknown, r: unknown[]) => void;
    const statement = {
      cancel: jest.fn((cb: () => void) => {
        complete(new Error('SQL execution canceled'), stmt, []);
        cb();
      }),
    };
    mockConnection.execute.mockImplementation((opts: { complete: (...a: unknown[]) => void }) => {
      complete = opts.complete as never;
      return statement;
    });
    const adapter = new SnowflakeApiAdapter(
      { authMethod: SnowflakeAuthMethod.PASSWORD, username: 'u', password: 'p' } as never,
      { account: 'a', warehouse: 'w' } as never
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.executeQuery('SELECT 1', false, undefined, controller.signal)
    ).rejects.toThrow();
    expect(statement.cancel).toHaveBeenCalledTimes(1);
  });

  it('does not attach a lingering abort listener when the query completes synchronously', async () => {
    const cancel = jest.fn((cb: () => void) => cb());
    const syncStmt = { getColumns: () => [], getQueryId: () => 'q1', cancel };
    // execute completes synchronously, before the adapter can register the abort handler.
    mockConnection.execute.mockImplementation((opts: { complete: (...a: unknown[]) => void }) => {
      opts.complete(null, syncStmt, []);
      return syncStmt;
    });
    const adapter = new SnowflakeApiAdapter(
      { authMethod: SnowflakeAuthMethod.PASSWORD, username: 'u', password: 'p' } as never,
      { account: 'a', warehouse: 'w' } as never
    );
    const controller = new AbortController();

    await adapter.executeQuery('SELECT 1', false, undefined, controller.signal);
    // The query already finished; a later abort on the (reused) signal must not reach the statement.
    controller.abort();

    expect(cancel).not.toHaveBeenCalled();
  });
});
