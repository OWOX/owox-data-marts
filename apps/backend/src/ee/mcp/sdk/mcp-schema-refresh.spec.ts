import type { McpAuthContext } from '../auth/mcp-auth-context';
import * as refreshModule from './mcp-schema-refresh';
import {
  McpSchemaRefresh,
  MCP_SCHEMA_REFRESH_MAX_ENTRIES,
  MCP_SCHEMA_REFRESH_TTL_MS,
} from './mcp-schema-refresh';

const context = {
  clientId: 'client-1',
  userId: 'user-1',
  projectId: 'project-1',
} as McpAuthContext;

describe('McpSchemaRefresh', () => {
  let now: number;
  beforeEach(() => {
    now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  const entries = (refresh: McpSchemaRefresh) =>
    (refresh as unknown as { expiresAtByClient: Map<string, number> }).expiresAtByClient;

  it('notifies at most once per five minutes for the same client', async () => {
    const refresh = new McpSchemaRefresh();
    const notify = jest.fn();
    await refresh.notifyIfDue(context, notify);
    now += MCP_SCHEMA_REFRESH_TTL_MS - 1;
    await refresh.notifyIfDue(context, notify);
    expect(notify).toHaveBeenCalledTimes(1);
    now += 1;
    await refresh.notifyIfDue(context, notify);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('separates clients, users and projects', async () => {
    const refresh = new McpSchemaRefresh();
    const notify = jest.fn();
    await refresh.notifyIfDue(context, notify);
    await refresh.notifyIfDue({ ...context, clientId: 'client-2' }, notify);
    await refresh.notifyIfDue({ ...context, userId: 'user-2' }, notify);
    await refresh.notifyIfDue({ ...context, projectId: 'project-2' }, notify);
    expect(notify).toHaveBeenCalledTimes(4);
  });

  it('reserves the cooldown before awaiting a notification and retries after a failed send', async () => {
    const refresh = new McpSchemaRefresh();
    let reject!: (error: Error) => void;
    const notify = jest.fn(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        })
    );
    const first = refresh.notifyIfDue(context, notify);
    await refresh.notifyIfDue(context, notify);
    expect(notify).toHaveBeenCalledTimes(1);
    reject(new Error('stream closed'));
    await expect(first).rejects.toThrow('stream closed');
    const retry = jest.fn();
    await refresh.notifyIfDue(context, retry);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('bounds the cache and prunes expired clients on subsequent calls', async () => {
    const refresh = new McpSchemaRefresh();
    const notify = jest.fn();
    for (let i = 0; i <= MCP_SCHEMA_REFRESH_MAX_ENTRIES; i++) {
      await refresh.notifyIfDue({ ...context, userId: `user-${i}` }, notify);
    }
    expect(entries(refresh).size).toBe(MCP_SCHEMA_REFRESH_MAX_ENTRIES);
    now += MCP_SCHEMA_REFRESH_TTL_MS;
    await refresh.notifyIfDue(context, notify);
    expect(entries(refresh).size).toBe(1);
    expect([...entries(refresh).keys()][0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('coalesces modern broadcasts across users on a pod', async () => {
    const refresh = new McpSchemaRefresh();
    const notify = jest.fn();
    await refresh.notifyIfDue(context, notify, true);
    await refresh.notifyIfDue({ ...context, userId: 'user-2' }, notify, true);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('stops notifying and clears the cache when recovery is disabled', async () => {
    const refresh = new McpSchemaRefresh();
    const notify = jest.fn();
    await refresh.notifyIfDue(context, notify);
    jest.replaceProperty(
      refreshModule as { MCP_SCHEMA_REFRESH_ENABLED: boolean },
      'MCP_SCHEMA_REFRESH_ENABLED',
      false
    );
    await refresh.notifyIfDue({ ...context, clientId: 'other' }, notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(entries(refresh).size).toBe(0);
  });
});
