import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  RandomIdGenerator,
} from '@opentelemetry/sdk-trace-base';
import { trace, context, SpanStatusCode, TraceFlags } from '@opentelemetry/api';
import {
  deriveTraceId,
  deriveRootSpanId,
  OverridableIdGenerator,
  emitGroupedSpan,
  createOtlpEmitter,
} from './otlp-emitter.js';

function setup() {
  const exporter = new InMemorySpanExporter();
  const idGen = new OverridableIdGenerator(new RandomIdGenerator());
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
    idGenerator: idGen,
  });
  const tracer = provider.getTracer('test');
  const deps = { tracer, trace, context, SpanStatusCode, TraceFlags, idGen };
  return { exporter, deps };
}

describe('derive helpers', () => {
  it('are deterministic and correctly sized', () => {
    expect(deriveTraceId('c')).toMatch(/^[0-9a-f]{32}$/);
    expect(deriveRootSpanId('c')).toMatch(/^[0-9a-f]{16}$/);
    expect(deriveTraceId('c')).toBe(deriveTraceId('c'));
    expect(deriveTraceId('a')).not.toBe(deriveTraceId('b'));
    expect(deriveRootSpanId('c')).not.toBe(deriveTraceId('c').slice(0, 16));
  });
});

describe('emitGroupedSpan', () => {
  it('emits a conversation root and a child tool span sharing the derived trace', () => {
    const { exporter, deps } = setup();
    emitGroupedSpan(
      deps,
      'mcp.tool_call',
      { owox_conversation_id: 'conv-1' },
      '2026-07-10T00:00:00.000Z',
      { groupId: 'conv-1', durationMs: 5, isError: false }
    );
    const spans = exporter.getFinishedSpans();
    const root = spans.find(s => s.name === 'conversation')!;
    const child = spans.find(s => s.name === 'mcp.tool_call')!;
    expect(root.spanContext().traceId).toBe(deriveTraceId('conv-1'));
    expect(root.spanContext().spanId).toBe(deriveRootSpanId('conv-1'));
    expect(child.spanContext().traceId).toBe(deriveTraceId('conv-1'));
    expect(child.parentSpanContext?.spanId).toBe(deriveRootSpanId('conv-1'));
    // The forced ids are one-shot: the child gets its own random span id, not the root's.
    expect(child.spanContext().spanId).not.toBe(deriveRootSpanId('conv-1'));
  });

  it('re-emits the same root ids for the same group (merge-ready)', () => {
    const { exporter, deps } = setup();
    const attrs = { owox_conversation_id: 'conv-2' };
    emitGroupedSpan(deps, 'mcp.tool_call', { ...attrs }, '2026-07-10T00:00:00.000Z', {
      groupId: 'conv-2',
      durationMs: 1,
    });
    emitGroupedSpan(deps, 'mcp.tool_call', { ...attrs }, '2026-07-10T00:00:01.000Z', {
      groupId: 'conv-2',
      durationMs: 1,
    });
    const roots = exporter.getFinishedSpans().filter(s => s.name === 'conversation');
    expect(roots).toHaveLength(2);
    expect(new Set(roots.map(s => s.spanContext().spanId)).size).toBe(1);
    expect(new Set(roots.map(s => s.spanContext().traceId)).size).toBe(1);
  });

  it('maps error status onto the child span from opts.isError, not attributes', () => {
    const { exporter, deps } = setup();
    emitGroupedSpan(
      deps,
      'mcp.tool_call',
      { owox_conversation_id: 'c', mcp_tool_status: 'ok' },
      '2026-07-10T00:00:00.000Z',
      { groupId: 'c', durationMs: 2, isError: true }
    );
    const child = exporter.getFinishedSpans().find(s => s.name === 'mcp.tool_call')!;
    expect(child.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('does not mark error status when isError is false even if attributes say error', () => {
    const { exporter, deps } = setup();
    emitGroupedSpan(
      deps,
      'mcp.tool_call',
      { owox_conversation_id: 'c2', mcp_tool_status: 'error' },
      '2026-07-10T00:00:00.000Z',
      { groupId: 'c2', durationMs: 2, isError: false }
    );
    const child = exporter.getFinishedSpans().find(s => s.name === 'mcp.tool_call')!;
    expect(child.status.code).not.toBe(SpanStatusCode.ERROR);
  });

  it('derives span window from opts.durationMs, not attributes.duration_ms', () => {
    const { exporter, deps } = setup();
    emitGroupedSpan(deps, 'mcp.tool_call', { duration_ms: 999 }, '2026-07-10T00:00:00.000Z', {
      durationMs: 5,
    });
    const span = exporter.getFinishedSpans().find(s => s.name === 'mcp.tool_call')!;
    const [startSec, startNanos] = span.startTime;
    const [endSec, endNanos] = span.endTime;
    const startMs = startSec * 1000 + startNanos / 1e6;
    const endMs = endSec * 1000 + endNanos / 1e6;
    expect(endMs - startMs).toBe(5);
  });

  it('emits a single unparented span when no group id is given', () => {
    const { exporter, deps } = setup();
    emitGroupedSpan(deps, 'mcp.tool_call', {}, '2026-07-10T00:00:00.000Z', { durationMs: 1 });
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].parentSpanContext).toBeUndefined();
  });

  it('defaults durationMs to 0 and isError to falsy when opts is empty', () => {
    const { exporter, deps } = setup();
    emitGroupedSpan(deps, 'mcp.tool_call', {}, '2026-07-10T00:00:00.000Z', {});
    const span = exporter.getFinishedSpans().find(s => s.name === 'mcp.tool_call')!;
    expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
    const [startSec, startNanos] = span.startTime;
    const [endSec, endNanos] = span.endTime;
    expect(endSec * 1000 + endNanos / 1e6 - (startSec * 1000 + startNanos / 1e6)).toBe(0);
  });

  it('uses opts.rootSpanName and opts.groupAttributeKey for the root span when provided', () => {
    const { exporter, deps } = setup();
    emitGroupedSpan(deps, 'mcp.tool_call', {}, '2026-07-10T00:00:00.000Z', {
      groupId: 'c',
      rootSpanName: 'mcp.conversation',
      groupAttributeKey: 'owox_conversation_id',
    });
    const root = exporter.getFinishedSpans().find(s => s.name === 'mcp.conversation')!;
    expect(root).toBeDefined();
    expect(root.attributes['owox_conversation_id']).toBe('c');
  });

  it('is synchronous and clears the one-shot id override before returning', () => {
    const { deps } = setup();
    emitGroupedSpan(deps, 'mcp.tool_call', {}, '2026-07-10T00:00:00.000Z', { groupId: 'c' });
    // The forced ids must be consumed/cleared by the time the call returns — any pending async
    // step here would let a concurrent span inherit the root's ids. Guards the sync invariant.
    expect(deps.idGen.nextTraceId).toBeUndefined();
    expect(deps.idGen.nextSpanId).toBeUndefined();
  });

  it('defaults the root span to name "conversation" with no group attribute when opts omit them', () => {
    const { exporter, deps } = setup();
    emitGroupedSpan(deps, 'mcp.tool_call', {}, '2026-07-10T00:00:00.000Z', { groupId: 'c' });
    const spans = exporter.getFinishedSpans();
    const root = spans.find(s => s.name === 'conversation')!;
    expect(root).toBeDefined();
    expect(spans.some(s => s.name === 'mcp.conversation')).toBe(false);
    expect(root.attributes).toEqual({});
  });
});

describe('createOtlpEmitter env-gating', () => {
  it('returns undefined for http/protobuf without an endpoint (no spans exported)', async () => {
    await expect(createOtlpEmitter({} as NodeJS.ProcessEnv)).resolves.toBeUndefined();
    await expect(
      createOtlpEmitter({ OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf' } as NodeJS.ProcessEnv)
    ).resolves.toBeUndefined();
  });

  it('an unknown protocol without an endpoint also gates to undefined', async () => {
    await expect(
      createOtlpEmitter({ OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc' } as NodeJS.ProcessEnv)
    ).resolves.toBeUndefined();
  });
});
