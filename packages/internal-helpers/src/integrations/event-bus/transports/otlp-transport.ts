import type { EventTransport } from '../types.js';
import type { BaseEvent } from '../base-event.js';
import { LoggerFactory } from '../../../logging/logger-factory.js';

export type SpanAttributeValue = string | number | boolean;

export interface OtlpSpanEmitter {
  /**
   * Emit a single completed span. Must not be async.
   * `opts.groupId` — when present, the span is parented under a deterministic conversation
   * root derived from it. `opts.durationMs`/`opts.isError` drive the span window and status.
   */
  emit(
    name: string,
    attributes: Record<string, SpanAttributeValue>,
    occurredAtIso: string,
    opts?: {
      groupId?: string;
      durationMs?: number;
      isError?: boolean;
      rootSpanName?: string;
      groupAttributeKey?: string;
    }
  ): void;
  /** Flush and release the exporter. Optional — call on app shutdown to avoid dropping the last batch. */
  shutdown?(): Promise<void>;
}

/** Flatten a payload into OTel span attributes: scalars pass through, objects → JSON strings. */
export function toSpanAttributes(
  payload: Record<string, unknown>
): Record<string, SpanAttributeValue> {
  const attrs: Record<string, SpanAttributeValue> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      attrs[k] = v;
    } else {
      attrs[k] = JSON.stringify(v);
    }
  }
  return attrs;
}

/** Span semantics derived from an event by a caller-supplied {@link OtlpTransportOptions.spanMapper}. */
export interface OtlpSpanInfo {
  name: string;
  groupId?: string;
  durationMs?: number;
  isError?: boolean;
}

/** Maps an event to OTLP span semantics (name/groupId/durationMs/isError). */
export type OtlpSpanMapper = (event: BaseEvent<Record<string, unknown>>) => OtlpSpanInfo;

export interface OtlpTransportOptions {
  /**
   * If set, only events whose name starts with one of these prefixes are emitted.
   * PII boundary: the shared bus also carries insights events (with PII); restricting to
   * e.g. ['mcp.'] keeps them out of an external OTLP backend. Undefined ⇒ all events.
   */
  eventNamePrefixes?: readonly string[];
  /**
   * Maps an event to span semantics (name/groupId/durationMs/isError). Without a mapper,
   * the span defaults to `{ name: event.name }`.
   */
  spanMapper?: OtlpSpanMapper;
  /** Root span name for grouped spans (default 'conversation'). */
  rootSpanName?: string;
  /** Attribute key under which groupId is set on the root span; omit → no root attribute. */
  groupAttributeKey?: string;
}

/**
 * Transport-2: turns each matching event into an OTLP span. OTel wiring lives behind
 * {@link OtlpSpanEmitter}; when it's undefined (OTel off / deps absent) send() is a no-op.
 */
export class OtlpTransport implements EventTransport {
  public readonly name = 'otlp' as const;
  private readonly logger = LoggerFactory.createNamedLogger('OtlpTransport');
  private readonly prefixes?: readonly string[];
  private readonly spanMapper?: OtlpSpanMapper;
  private readonly rootSpanName?: string;
  private readonly groupAttributeKey?: string;

  constructor(
    private readonly emitter: OtlpSpanEmitter | undefined,
    options: OtlpTransportOptions = {}
  ) {
    this.prefixes = options.eventNamePrefixes;
    this.spanMapper = options.spanMapper;
    this.rootSpanName = options.rootSpanName;
    this.groupAttributeKey = options.groupAttributeKey;
  }

  async send(event: BaseEvent<Record<string, unknown>>): Promise<void> {
    if (!this.emitter) return;
    if (this.prefixes && !this.prefixes.some(p => event.name.startsWith(p))) return;
    try {
      const attributes = toSpanAttributes(event.payload);
      // traceparent is W3C-standard per-request context; keep it out of span attributes.
      delete attributes['traceparent'];
      const info: OtlpSpanInfo = this.spanMapper ? this.spanMapper(event) : { name: event.name };
      this.emitter.emit(info.name, attributes, event.occurredAt ?? new Date().toISOString(), {
        groupId: info.groupId,
        durationMs: info.durationMs,
        isError: info.isError,
        rootSpanName: this.rootSpanName,
        groupAttributeKey: this.groupAttributeKey,
      });
    } catch (error) {
      // t2 is best-effort; never break fan-out
      this.logger.warn('OTLP span emit failed', { error: String(error) });
    }
  }
}
