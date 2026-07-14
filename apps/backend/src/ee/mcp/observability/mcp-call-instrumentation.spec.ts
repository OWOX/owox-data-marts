import { McpCallInstrumentation } from './mcp-call-instrumentation';
import { MCP_TOOL_DIAGNOSTICS_KEY } from './mcp-tool-diagnostics';

const makeDispatcher = () => ({ publishExternalSafely: jest.fn() });
// Key-aware fake: diagnostics for MCP_TOOL_DIAGNOSTICS_KEY, log context otherwise. (_meta is no
// longer a CLS slot — it arrives per-call in the SDK `extra`.)
const makeCls = (
  ctx: Record<string, unknown> = { projectId: 'p1', requestId: 'r1' },
  diag: Record<string, unknown> = {}
) => ({
  get: jest.fn((key: string) => (key === MCP_TOOL_DIAGNOSTICS_KEY ? diag : ctx)),
  set: jest.fn(),
});

// Stateful fake: a real store keyed by the CLS key string, so `set`/`update` from call 1
// are actually visible (or correctly cleared) when call 2 reads via `get`.
const makeStatefulCls = (ctx: Record<string, unknown> = { projectId: 'p1', requestId: 'r1' }) => {
  const store = new Map<string, Record<string, unknown>>();
  return {
    get: jest.fn((key: string) => (key === MCP_TOOL_DIAGNOSTICS_KEY ? store.get(key) : ctx)),
    set: jest.fn((key: string, value: Record<string, unknown>) => {
      store.set(key, value);
    }),
    update: jest.fn((key: string, partial: Record<string, unknown>) => {
      store.set(key, { ...(store.get(key) ?? {}), ...partial });
    }),
  };
};

describe('McpCallInstrumentation', () => {
  it('зберігає результат handler і емітить подію success', async () => {
    const dispatcher = makeDispatcher();
    const instr = new McpCallInstrumentation(dispatcher as never, makeCls() as never);
    const result = { content: [{ type: 'text', text: 'ok' }] };
    const wrapped = instr.wrap('query_data_mart', async () => result);

    await expect(wrapped({ id: 'dm1' })).resolves.toBe(result);
    expect(dispatcher.publishExternalSafely).toHaveBeenCalledTimes(1);
    const ev = dispatcher.publishExternalSafely.mock.calls[0][0];
    expect(ev.name).toBe('mcp.tool_call');
    expect(ev.payload['mcp_tool_status']).toBe('ok');
    expect(ev.payload['owox_project_id']).toBe('p1');
  });

  it('прокидає помилку handler незмінно і емітить подію error', async () => {
    const dispatcher = makeDispatcher();
    const instr = new McpCallInstrumentation(dispatcher as never, makeCls() as never);
    const boom = new Error('boom');
    const wrapped = instr.wrap('run_report', async () => {
      throw boom;
    });

    await expect(wrapped({})).rejects.toBe(boom);
    expect(dispatcher.publishExternalSafely).toHaveBeenCalledTimes(1);
    expect(dispatcher.publishExternalSafely.mock.calls[0][0].payload['mcp_tool_status']).toBe(
      'error'
    );
  });

  it('провал емісії НЕ ламає tool-call', async () => {
    const dispatcher = {
      publishExternalSafely: jest.fn(() => {
        throw new Error('emit fail');
      }),
    };
    const instr = new McpCallInstrumentation(dispatcher as never, makeCls() as never);
    const result = { content: [] };
    const wrapped = instr.wrap('x', async () => result);
    await expect(wrapped({})).resolves.toBe(result);
  });

  it('прокидає abort signal у handler', async () => {
    const dispatcher = makeDispatcher();
    const instr = new McpCallInstrumentation(dispatcher as never, makeCls() as never);
    const handler = jest.fn(async () => ({ content: [] }));
    const wrapped = instr.wrap('x', handler);
    const signal = new AbortController().signal;
    await wrapped({ a: 1 }, { signal });
    expect(handler).toHaveBeenCalledWith({ a: 1 }, { signal });
  });

  it('executedSql з CLS-діагностики потрапляє у подію', async () => {
    const dispatcher = makeDispatcher();
    const cls = makeCls({ projectId: 'p1' }, { executedSql: 'SELECT 42' });
    const instr = new McpCallInstrumentation(dispatcher as never, cls as never);
    const wrapped = instr.wrap('query_data_mart', async () => ({ content: [] }));
    await wrapped({});
    const ev = dispatcher.publishExternalSafely.mock.calls[0][0];
    expect(ev.payload['__offload__']['sql']).toBe('SELECT 42');
  });

  it('очищає діагностику per-call: SQL попереднього виклику не протікає у наступний tool', async () => {
    const dispatcher = makeDispatcher();
    const cls = makeStatefulCls();
    const instr = new McpCallInstrumentation(dispatcher as never, cls as never);

    const queryHandler = instr.wrap('query_data_mart', async () => {
      cls.update(MCP_TOOL_DIAGNOSTICS_KEY, { executedSql: 'SELECT 1' });
      return { content: [] };
    });
    const otherHandler = instr.wrap('list_data_marts', async () => ({ content: [] }));

    await queryHandler({});
    await otherHandler({});

    expect(dispatcher.publishExternalSafely).toHaveBeenCalledTimes(2);
    const firstEvent = dispatcher.publishExternalSafely.mock.calls[0][0];
    const secondEvent = dispatcher.publishExternalSafely.mock.calls[1][0];
    expect(firstEvent.payload['__offload__']['sql']).toBe('SELECT 1');
    expect(secondEvent.payload['__offload__']['sql']).toBeUndefined();
  });

  it('per-call _meta з SDK extra дає conversation id у події', async () => {
    const dispatcher = makeDispatcher();
    const instr = new McpCallInstrumentation(
      dispatcher as never,
      makeCls({ projectId: 'p1' }) as never
    );
    const wrapped = instr.wrap('query_data_mart', async () => ({ content: [] }));
    await wrapped({}, { _meta: { 'openai/session': 'sess-x' } });
    const ev = dispatcher.publishExternalSafely.mock.calls[0][0];
    expect(ev.payload['owox_conversation_id']).toBe('sess-x');
    expect(ev.payload['owox_conversation_id_is_pseudo']).toBe(false);
  });

  it('батч: кожен виклик бере власний _meta з extra, а не перший на весь запит', async () => {
    const dispatcher = makeDispatcher();
    const instr = new McpCallInstrumentation(
      dispatcher as never,
      makeCls({ projectId: 'p1' }) as never
    );
    const callA = instr.wrap('query_data_mart', async () => ({ content: [] }));
    const callB = instr.wrap('list_data_marts', async () => ({ content: [] }));

    // Two JSON-RPC messages in one batch, each with its own conversation _meta.
    await callA({}, { _meta: { 'openai/session': 'conv-A' } });
    await callB({}, { _meta: { 'openai/session': 'conv-B' } });

    const [evA, evB] = dispatcher.publishExternalSafely.mock.calls.map(c => c[0]);
    expect(evA.payload['owox_conversation_id']).toBe('conv-A');
    expect(evB.payload['owox_conversation_id']).toBe('conv-B');
    expect(evA.payload['owox_conversation_id']).not.toBe(evB.payload['owox_conversation_id']);
  });
});
