import { deriveTraceId, OFFLOAD_KEY } from '@owox/internal-helpers';
import { buildMcpToolCallEvent, type BuildMcpToolCallEventParams } from './mcp-tool-call-event';

const ctx = { projectId: 'p1', userId: 'u1', clientId: 'c1', requestId: 'r1', sessionId: 's1' };

function baseParams(
  overrides: Partial<BuildMcpToolCallEventParams> = {}
): BuildMcpToolCallEventParams {
  return {
    methodName: 'tools/call',
    toolName: 't',
    input: {},
    result: { content: [] },
    durationMs: 1,
    context: {},
    ...overrides,
  };
}

describe('buildMcpToolCallEvent', () => {
  it('успіх: OTel-conv поля + status ok + context', () => {
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'query_data_mart',
      input: { id: 'dm1' },
      result: { content: [{ type: 'text', text: 'ok' }], structuredContent: { rows: 3 } },
      durationMs: 42,
      context: ctx,
    });
    expect(ev.name).toBe('mcp.tool_call');
    const p = ev.payload as Record<string, unknown>;
    expect(p['mcp_method_name']).toBe('tools/call');
    expect(p['mcp_tool_name']).toBe('query_data_mart');
    expect(p['mcp_tool_status']).toBe('ok');
    expect(p['duration_ms']).toBe(42);
    expect(p['owox_project_id']).toBe('p1');
    expect(p['owox_request_id']).toBe('r1');
    const blob = p[OFFLOAD_KEY] as Record<string, unknown>;
    expect(blob['arguments']).toEqual({ id: 'dm1' });
    expect(blob['result']).toEqual({ rows: 3 });
  });

  it('offload blob is self-describing: identity fields match the top-level payload, plus occurred_at == event.occurredAt', () => {
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'query_data_mart',
      input: { id: 'dm1' },
      result: { content: [{ type: 'text', text: 'ok' }], structuredContent: { rows: 3 } },
      durationMs: 42,
      context: ctx,
    });
    const p = ev.payload as Record<string, unknown>;
    const blob = p[OFFLOAD_KEY] as Record<string, unknown>;
    expect(blob['owox_request_id']).toBe(p['owox_request_id']);
    expect(blob['owox_project_id']).toBe(p['owox_project_id']);
    expect(blob['owox_conversation_id']).toBe(p['owox_conversation_id']);
    expect(blob['mcp_tool_name']).toBe(p['mcp_tool_name']);
    expect(blob['mcp_method_name']).toBe(p['mcp_method_name']);
    expect(blob['mcp_tool_status']).toBe(p['mcp_tool_status']);
    expect(blob['occurred_at']).toBe(ev.occurredAt);
  });

  it('кинута помилка: status error + error_type/message', () => {
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'run_report',
      input: {},
      error: new TypeError('bad'),
      durationMs: 5,
      context: ctx,
    });
    const p = ev.payload as Record<string, unknown>;
    expect(p['mcp_tool_status']).toBe('error');
    expect(p['error_type']).toBe('TypeError');
    expect(p['error_message']).toBe('bad');
  });

  it('result.isError → status error', () => {
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'x',
      input: {},
      result: { content: [{ type: 'text', text: 'nope' }], isError: true },
      durationMs: 1,
      context: ctx,
    });
    expect((ev.payload as Record<string, unknown>)['mcp_tool_status']).toBe('error');
  });

  it('structured error (result.isError) hoists a top-level reason so it survives offload', () => {
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'x',
      input: {},
      result: { content: [{ type: 'text', text: 'field_not_found: foo' }], isError: true },
      durationMs: 1,
      context: ctx,
    });
    const p = ev.payload as Record<string, unknown>;
    expect(p['error_type']).toBe('ToolError');
    expect(p['error_message']).toBe('field_not_found: foo');
  });

  it('structured error with no text content falls back to a generic reason', () => {
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'x',
      input: {},
      result: { content: [], isError: true },
      durationMs: 1,
      context: ctx,
    });
    const p = ev.payload as Record<string, unknown>;
    expect(p['error_type']).toBe('ToolError');
    expect(p['error_message']).toBe('tool returned isError');
  });

  it('redaction: auth-подібні ключі в args вирізаються', () => {
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'x',
      input: { id: 'ok', authorization: 'Bearer zzz', apiKey: 'secret', nested: { token: 't' } },
      durationMs: 1,
      context: ctx,
    });
    const blob = (ev.payload as Record<string, unknown>)[OFFLOAD_KEY] as Record<string, unknown>;
    const args = blob['arguments'] as Record<string, unknown>;
    expect(args['id']).toBe('ok');
    expect(args['authorization']).toBe('[REDACTED]');
    expect(args['apiKey']).toBe('[REDACTED]');
    expect((args['nested'] as Record<string, unknown>)['token']).toBe('[REDACTED]');
  });

  it('executedSql потрапляє в offload під sql', () => {
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'query_data_mart',
      input: {},
      result: { content: [] },
      durationMs: 1,
      context: ctx,
      executedSql: 'SELECT 1',
    });
    const blob = (ev.payload as Record<string, unknown>)[OFFLOAD_KEY] as Record<string, unknown>;
    expect(blob['sql']).toBe('SELECT 1');
  });

  it('client/protocol/trace context → payload; trace_id = derived conversation trace id', () => {
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'list_destinations',
      input: {},
      result: { content: [] },
      durationMs: 1,
      context: {
        ...ctx,
        protocolVersion: '2025-11-25',
        userAgent: 'Claude-User',
        clientVendor: 'ClaudeAI',
        traceparent: '00-89f08b698684e76d81cf47333ab2a174-85d2acb4c5e0403b-01',
      },
    });
    const p = ev.payload as Record<string, unknown>;
    expect(p['mcp_protocol_version']).toBe('2025-11-25');
    expect(p['owox_client_user_agent']).toBe('Claude-User');
    expect(p['owox_client_vendor']).toBe('ClaudeAI');
    // Raw client traceparent is retained on the event as-is — it is NOT used to parent spans
    // (grouping is by conversation id; the OTLP transport just strips it from span attributes).
    expect(p['traceparent']).toBe('00-89f08b698684e76d81cf47333ab2a174-85d2acb4c5e0403b-01');
    // trace_id is the derived conversation trace id, not extracted from traceparent.
    expect(p['trace_id']).toBe(deriveTraceId(p['owox_conversation_id'] as string));
    expect(p['trace_id']).not.toBe('89f08b698684e76d81cf47333ab2a174');
  });

  it('malformed traceparent does not affect trace_id (still derived from conversation id)', () => {
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'x',
      input: {},
      result: { content: [] },
      durationMs: 1,
      context: { ...ctx, traceparent: 'garbage' },
    });
    const p = ev.payload as Record<string, unknown>;
    expect(p['traceparent']).toBe('garbage');
    expect(p['trace_id']).toBe(deriveTraceId(p['owox_conversation_id'] as string));
  });

  // Dynamic `meta_*` keys aren't declared on McpToolCallEventPayload — read them via a cast.
  it('uses the real conversation id from _meta when present', () => {
    const event = buildMcpToolCallEvent(
      baseParams({
        context: { userId: 'u1', projectId: 'p1' },
        meta: { 'openai/session': 'sess-9' },
      })
    );
    const p = event.payload as Record<string, unknown>;
    expect(event.payload['owox_conversation_id']).toBe('sess-9');
    expect(event.payload['owox_conversation_id_is_pseudo']).toBe(false);
    expect(p['meta_openai_session']).toBe('sess-9');
    expect(event.payload['trace_id']).toBe(deriveTraceId('sess-9'));
    // Raw _meta is never persisted in the offload blob (only redacted, flattened meta_* keys inline).
    expect((event.payload[OFFLOAD_KEY] as Record<string, unknown>)['meta']).toBeUndefined();
  });

  it('falls back to a deterministic pseudo conversation id, stable per user+project+UTC-day', () => {
    const ctx = { userId: 'u1', projectId: 'p1' };
    const a = buildMcpToolCallEvent(baseParams({ context: ctx }));
    const b = buildMcpToolCallEvent(baseParams({ context: ctx }));
    expect(a.payload['owox_conversation_id_is_pseudo']).toBe(true);
    expect(a.payload['owox_conversation_id']).toMatch(/^[0-9a-f]{32}$/);
    expect(a.payload['owox_conversation_id']).toBe(b.payload['owox_conversation_id']);
    expect(a.payload['trace_id']).toBe(deriveTraceId(a.payload['owox_conversation_id'] as string));

    const other = buildMcpToolCallEvent(baseParams({ context: { userId: 'u2', projectId: 'p1' } }));
    expect(other.payload['owox_conversation_id']).not.toBe(a.payload['owox_conversation_id']);
  });

  it('anonymous calls (no user/project) group per request, not into one global trace', () => {
    const a = buildMcpToolCallEvent(baseParams({ context: { requestId: 'req-a' } }));
    const b = buildMcpToolCallEvent(baseParams({ context: { requestId: 'req-b' } }));
    const a2 = buildMcpToolCallEvent(baseParams({ context: { requestId: 'req-a' } }));
    expect(a.payload['owox_conversation_id_is_pseudo']).toBe(true);
    expect(a.payload['owox_conversation_id']).not.toBe(b.payload['owox_conversation_id']);
    expect(a.payload['owox_conversation_id']).toBe(a2.payload['owox_conversation_id']);
  });

  it('redacts secret-looking _meta keys and stringifies non-scalar values', () => {
    const event = buildMcpToolCallEvent(
      baseParams({
        context: { userId: 'u1', projectId: 'p1' },
        meta: { token: 'abc', 'openai/userLocation': { city: 'Kyiv' } },
      })
    );
    const p = event.payload as Record<string, unknown>;
    expect(p['meta_token']).toBe('[REDACTED]');
    expect(p['meta_openai_userLocation']).toBe('{"city":"Kyiv"}');
  });

  it('redacts secret keys nested inside non-scalar _meta values', () => {
    const event = buildMcpToolCallEvent(
      baseParams({
        context: { userId: 'u1', projectId: 'p1' },
        meta: { 'openai/userLocation': { city: 'Kyiv', apiKey: 'SECRET' } },
      })
    );
    const p = event.payload as Record<string, unknown>;
    expect(p['meta_openai_userLocation']).toBe('{"city":"Kyiv","apiKey":"[REDACTED]"}');
  });

  it('redacts secret-named fields inside the tool result', () => {
    const event = buildMcpToolCallEvent(
      baseParams({
        result: { structuredContent: { rows: [{ id: 1, token: 'SECRET' }] }, content: [] },
      })
    );
    const offload = event.payload[OFFLOAD_KEY] as Record<string, unknown>;
    expect(JSON.stringify(offload['result'])).toContain('[REDACTED]');
    expect(JSON.stringify(offload['result'])).not.toContain('SECRET');
  });

  it('truncates oversized flattened _meta values', () => {
    const event = buildMcpToolCallEvent(
      baseParams({
        context: { userId: 'u1', projectId: 'p1' },
        meta: { big: 'x'.repeat(5000) },
      })
    );
    const p = event.payload as Record<string, unknown>;
    expect((p['meta_big'] as string).length).toBeLessThan(1100);
    expect(p['meta_big']).toContain('[truncated]');
  });

  it('redacts compound secret keys via substring match (access_token, client_secret, etc.)', () => {
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'x',
      input: {
        id: 'ok',
        access_token: 'a',
        refresh_token: 'r',
        client_secret: 'c',
        private_key: 'k',
        credentials: 'cr',
      },
      durationMs: 1,
      context: ctx,
    });
    const args = (ev.payload[OFFLOAD_KEY] as Record<string, unknown>)['arguments'] as Record<
      string,
      unknown
    >;
    expect(args['id']).toBe('ok');
    expect(args['access_token']).toBe('[REDACTED]');
    expect(args['refresh_token']).toBe('[REDACTED]');
    expect(args['client_secret']).toBe('[REDACTED]');
    expect(args['private_key']).toBe('[REDACTED]');
    expect(args['credentials']).toBe('[REDACTED]');
  });

  it('redact tolerates deep nesting without throwing and preserves a literal __proto__ key', () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 50; i++) deep = { nested: deep };
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'x',
      input: { deep, ['__proto__']: { polluted: true } },
      durationMs: 1,
      context: ctx,
    });
    const args = (ev.payload[OFFLOAD_KEY] as Record<string, unknown>)['arguments'] as Record<
      string,
      unknown
    >;
    // A literal __proto__ key survives as own data (null-proto), not swallowed into the prototype.
    expect(JSON.stringify(args)).toContain('__proto__');
    // Deep chains are capped, not recursed into a RangeError (which would silently drop the event).
    expect(JSON.stringify(args)).toContain('[TRUNCATED]');
  });

  it('caps the number of flattened _meta keys and flags meta_truncated', () => {
    const meta: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) meta[`k${i}`] = i;
    const ev = buildMcpToolCallEvent(baseParams({ context: { userId: 'u1' }, meta }));
    const p = ev.payload as Record<string, unknown>;
    expect(p['meta_truncated']).toBe(true);
    expect(p['meta_k0']).toBe(0);
    expect(p['meta_k99']).toBeUndefined();
  });

  it('a falsy thrown value (e.g. empty string) still counts as an error', () => {
    const ev = buildMcpToolCallEvent({
      methodName: 'tools/call',
      toolName: 'x',
      input: {},
      error: '',
      durationMs: 1,
      context: ctx,
    });
    expect((ev.payload as Record<string, unknown>)['mcp_tool_status']).toBe('error');
  });
});
