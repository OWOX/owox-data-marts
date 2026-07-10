import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  GcsBlobStore,
  PayloadOffloader,
  OtlpTransport,
  createOtlpEmitter,
  LoggerFactory,
  type OtlpSpanEmitter,
  type OtlpSpanInfo,
  type EventBusExtras,
  type EventTransport,
  type BaseEvent,
} from '@owox/internal-helpers';

const DEFAULT_INLINE_MAX_BYTES = 4096;
// First upload after start pays GCP SDK load + ADC token fetch + TLS, which can exceed 5s cold.
const GCS_TIMEOUT_MS = 10000;

const logger = LoggerFactory.createNamedLogger('McpBusWiring');

const logSchema = z.object({
  MCP_LOG_GCS_BUCKET: z.string().trim().min(1).optional().catch(undefined),
  MCP_LOG_INLINE_MAX_BYTES: z.coerce.number().int().positive().optional().catch(undefined),
});

/**
 * mcp/<UTC-date>/<project>/<request>-<nonce>.json. The random nonce keeps two offloads from the
 * same request (e.g. a JSON-RPC batch) from overwriting each other; the real URI is always read
 * back from owox_payload_ref, so the path need not be predictable.
 */
export function mcpOffloadPathBuilder(payload: Record<string, unknown>): string {
  const date = new Date().toISOString().slice(0, 10);
  const project = String(payload['owox_project_id'] ?? 'unknown');
  const request = String(payload['owox_request_id'] ?? 'unknown');
  return `mcp/${date}/${project}/${request}-${randomUUID().slice(0, 8)}.json`;
}

/** Event → OTLP span semantics for MCP tool-call events. */
export function mcpSpanMapper(event: BaseEvent<Record<string, unknown>>): OtlpSpanInfo {
  const p = event.payload;
  return {
    name:
      typeof p['mcp_tool_name'] === 'string' && p['mcp_tool_name']
        ? String(p['mcp_tool_name'])
        : event.name,
    groupId:
      typeof p['owox_conversation_id'] === 'string'
        ? (p['owox_conversation_id'] as string)
        : undefined,
    durationMs: typeof p['duration_ms'] === 'number' ? (p['duration_ms'] as number) : undefined,
    isError: p['mcp_tool_status'] === 'error',
  };
}

function buildMcpOffloader(env: NodeJS.ProcessEnv): PayloadOffloader {
  const parsed = logSchema.safeParse(env);
  const cfg = parsed.success ? parsed.data : {};
  const inlineMaxBytes = cfg.MCP_LOG_INLINE_MAX_BYTES ?? DEFAULT_INLINE_MAX_BYTES;
  if (env.MCP_LOG_INLINE_MAX_BYTES && cfg.MCP_LOG_INLINE_MAX_BYTES === undefined) {
    logger.warn('Invalid MCP_LOG_INLINE_MAX_BYTES; using default', {
      value: env.MCP_LOG_INLINE_MAX_BYTES,
      default: DEFAULT_INLINE_MAX_BYTES,
    });
  }
  const bucket = cfg.MCP_LOG_GCS_BUCKET;
  // Off by default: tool arguments/results/SQL can carry client data (PII), so they never reach the
  // general logs unless explicitly opted in. With a bucket they still go to the ADC-gated GCS tier;
  // without one and without opt-in they are dropped — only identity/status/error stay inline.
  const inlinePayloads = env.MCP_LOG_INLINE_PAYLOADS === 'true';
  if (bucket) {
    return new PayloadOffloader({
      sink: 'gcs',
      // inline off ⇒ 0 threshold ⇒ every payload is offloaded to GCS, never inlined into logs.
      inlineMaxBytes: inlinePayloads ? inlineMaxBytes : 0,
      blobStore: new GcsBlobStore(bucket, GCS_TIMEOUT_MS),
      pathBuilder: mcpOffloadPathBuilder,
    });
  }
  return new PayloadOffloader({ sink: inlinePayloads ? 'inline' : 'none', inlineMaxBytes });
}

function buildMcpOtlpTransport(
  env: NodeJS.ProcessEnv,
  shutdowns: Array<() => Promise<void>>
): EventTransport {
  let ready: OtlpSpanEmitter | undefined;
  let warnedNotReady = false;
  void createOtlpEmitter(env, { tracerName: 'owox-mcp' })
    .then(e => {
      ready = e;
      if (e?.shutdown) shutdowns.push(() => e.shutdown!());
    })
    .catch(() => {
      // createOtlpEmitter logs its own failures; swallow here so a rejected init can never
      // surface as an unhandledRejection.
    });
  return new OtlpTransport(
    {
      emit: (name, attrs, at, opts) => {
        if (ready) return ready.emit(name, attrs, at, opts);
        // Cold start: emitter still resolving (dynamic import + ADC). Warn once so dropped
        // startup spans aren't silent; steady state is unaffected.
        if (!warnedNotReady) {
          warnedNotReady = true;
          logger.warn('OTLP emitter not ready; dropping spans during cold start');
        }
      },
    },
    {
      eventNamePrefixes: ['mcp.'],
      spanMapper: mcpSpanMapper,
      rootSpanName: 'mcp.conversation',
      groupAttributeKey: 'owox_conversation_id',
    }
  );
}

/** Bus extras plus a shutdown hook that flushes the OTLP exporter's last span batch on app shutdown. */
export interface McpBusExtras extends EventBusExtras {
  shutdown(): Promise<void>;
}

/**
 * Assemble the MCP-specific bus extras injected at the producer composition root.
 *
 * Single-owner: the returned offloader becomes the whole bus's offloader (see BUS_EXTRAS). It is
 * intended solely for mcp.* events — its path builder namespaces every object under `mcp/`, so a
 * non-MCP event routed through it would land under an mcp/…/unknown path. Do not register a second
 * BUS_EXTRAS provider.
 */
export function buildMcpBusExtras(env: NodeJS.ProcessEnv = process.env): McpBusExtras {
  const shutdowns: Array<() => Promise<void>> = [];
  const extraTransports: EventTransport[] = [];
  const otelFlag = env.MCP_OTEL_ENABLED;
  if (otelFlag === 'true') {
    extraTransports.push(buildMcpOtlpTransport(env, shutdowns));
  } else if (otelFlag && /^(true|1|yes|on)$/i.test(otelFlag.trim())) {
    logger.warn("MCP_OTEL_ENABLED must be exactly 'true' to enable OTLP; value ignored", {
      value: otelFlag,
    });
  }
  return {
    extraTransports,
    offloader: buildMcpOffloader(env),
    // Flush the OTLP exporter's pending batch on shutdown; hooks live in this closure, not module state.
    async shutdown() {
      const hooks = shutdowns.splice(0);
      await Promise.allSettled(hooks.map(h => h()));
    },
  };
}
