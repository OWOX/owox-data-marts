import type { OtlpSpanEmitter, SpanAttributeValue } from './otlp-transport.js';
import { LoggerFactory } from '../../../logging/logger-factory.js';
import { createHash } from 'node:crypto';

export function deriveTraceId(groupId: string): string {
  return createHash('sha256').update(groupId).digest('hex').slice(0, 32);
}
export function deriveRootSpanId(groupId: string): string {
  return createHash('sha256').update(`root:${groupId}`).digest('hex').slice(0, 16);
}

/**
 * One-shot id override over a base generator. Set nextTraceId/nextSpanId immediately before
 * creating the conversation root; the values are consumed once, then generation reverts to random
 * (so child spans get random span ids under the inherited trace).
 */
export class OverridableIdGenerator {
  nextTraceId?: string;
  nextSpanId?: string;
  constructor(private readonly base: { generateTraceId(): string; generateSpanId(): string }) {}
  generateTraceId(): string {
    const v = this.nextTraceId;
    this.nextTraceId = undefined;
    return v ?? this.base.generateTraceId();
  }
  generateSpanId(): string {
    const v = this.nextSpanId;
    this.nextSpanId = undefined;
    return v ?? this.base.generateSpanId();
  }
}

export interface OtlpEmitDeps {
  tracer: import('@opentelemetry/api').Tracer;
  trace: typeof import('@opentelemetry/api').trace;
  context: typeof import('@opentelemetry/api').context;
  SpanStatusCode: typeof import('@opentelemetry/api').SpanStatusCode;
  TraceFlags: typeof import('@opentelemetry/api').TraceFlags;
  idGen: OverridableIdGenerator;
}

/**
 * Emit a completed tool-call span. With opts.groupId, re-emit the deterministic conversation root
 * (Cloud Trace merges spans by (traceId, spanId)) and parent the tool span under it.
 * Span window = end at occurredAt, start opts.durationMs earlier (real latency lives there).
 */
export function emitGroupedSpan(
  deps: OtlpEmitDeps,
  name: string,
  attributes: Record<string, SpanAttributeValue>,
  occurredAtIso: string,
  opts: {
    groupId?: string;
    durationMs?: number;
    isError?: boolean;
    rootSpanName?: string;
    groupAttributeKey?: string;
  } = {}
): void {
  const { tracer, trace, context, SpanStatusCode, TraceFlags, idGen } = deps;
  const parsedEnd = new Date(occurredAtIso).getTime();
  const endMs = Number.isFinite(parsedEnd) ? parsedEnd : Date.now();
  const durationMs = typeof opts.durationMs === 'number' ? opts.durationMs : 0;
  const startTime = new Date(endMs - durationMs);
  const applyStatus = (span: import('@opentelemetry/api').Span) => {
    if (opts.isError) span.setStatus({ code: SpanStatusCode.ERROR });
  };
  const groupId = opts.groupId;

  if (!groupId) {
    const span = tracer.startSpan(name, { attributes, startTime });
    applyStatus(span);
    span.end(new Date(endMs));
    return;
  }

  const traceId = deriveTraceId(groupId);
  const rootSpanId = deriveRootSpanId(groupId);
  const rootName = opts.rootSpanName ?? 'conversation';
  const rootAttributes = opts.groupAttributeKey ? { [opts.groupAttributeKey]: groupId } : {};

  idGen.nextTraceId = traceId;
  idGen.nextSpanId = rootSpanId;
  let root: import('@opentelemetry/api').Span;
  try {
    root = tracer.startSpan(rootName, {
      root: true,
      startTime,
      attributes: rootAttributes,
    });
  } finally {
    // The override is one-shot; clear it even if startSpan throws so it can't leak to the next span.
    idGen.nextTraceId = undefined;
    idGen.nextSpanId = undefined;
  }
  root.end(new Date(endMs));

  const parentCtx = trace.setSpanContext(context.active(), {
    traceId,
    spanId: rootSpanId,
    traceFlags: TraceFlags.SAMPLED,
    isRemote: true,
  });
  const span = tracer.startSpan(name, { attributes, startTime }, parentCtx);
  applyStatus(span);
  span.end(new Date(endMs));
}

/**
 * Build a real OTLP emitter from env, or undefined when disabled/unavailable.
 * Transport picked by `OTEL_EXPORTER_OTLP_PROTOCOL` (http/protobuf default | gcp).
 * Deps are optional (dynamic import); absence → undefined.
 */
export async function createOtlpEmitter(
  env: NodeJS.ProcessEnv = process.env,
  opts: { tracerName?: string } = {}
): Promise<OtlpSpanEmitter | undefined> {
  const logger = LoggerFactory.createNamedLogger('OtlpEmitter');
  const rawProtocol = (env.OTEL_EXPORTER_OTLP_PROTOCOL ?? 'http/protobuf').trim();
  if (rawProtocol !== 'gcp' && rawProtocol !== 'http/protobuf') {
    logger.warn('Unknown OTEL_EXPORTER_OTLP_PROTOCOL; falling back to http/protobuf', {
      protocol: rawProtocol,
    });
  }
  const protocol = rawProtocol === 'gcp' ? 'gcp' : 'http/protobuf';
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (protocol !== 'gcp' && !endpoint) {
    logger.warn(
      'OTLP tracing enabled but OTEL_EXPORTER_OTLP_ENDPOINT is unset for this protocol; spans will NOT be exported',
      { protocol }
    );
    return undefined;
  }

  try {
    const [
      { trace, context, SpanStatusCode, TraceFlags },
      { NodeTracerProvider },
      { BatchSpanProcessor, RandomIdGenerator },
    ] = await Promise.all([
      import('@opentelemetry/api'),
      import('@opentelemetry/sdk-trace-node'),
      import('@opentelemetry/sdk-trace-base'),
    ]);

    let exporter: ConstructorParameters<typeof BatchSpanProcessor>[0];
    if (protocol === 'gcp') {
      const { TraceExporter } = await import('@google-cloud/opentelemetry-cloud-trace-exporter');
      exporter = new TraceExporter({});
    } else {
      const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
      exporter = new OTLPTraceExporter({ url: endpoint });
    }

    const idGen = new OverridableIdGenerator(new RandomIdGenerator());
    const provider = new NodeTracerProvider({
      spanProcessors: [new BatchSpanProcessor(exporter)],
      idGenerator: idGen,
    });
    // Use the provider's own tracer, not provider.register(): registering globally in a shared
    // package would route any unrelated trace.getTracer() spans through this exporter (PII risk).
    // Tracer name is caller-supplied so this layer carries no domain (MCP) knowledge.
    const tracer = provider.getTracer(opts.tracerName ?? 'owox');
    logger.info('OTLP tracing enabled', { protocol, endpoint: endpoint ?? '(gcp/adc)' });

    const deps: OtlpEmitDeps = { tracer, trace, context, SpanStatusCode, TraceFlags, idGen };
    return {
      emit(name, attributes, occurredAtIso, opts = {}): void {
        emitGroupedSpan(deps, name, attributes, occurredAtIso, opts);
      },
      async shutdown(): Promise<void> {
        // Flush the BatchSpanProcessor's pending batch so the last spans aren't dropped on deploy.
        await provider.shutdown();
      },
    };
  } catch (error) {
    logger.warn('OTLP emitter unavailable (optional deps missing?)', { error: String(error) });
    return undefined;
  }
}
