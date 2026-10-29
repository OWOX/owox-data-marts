import { BaseEvent, deriveTraceId, OFFLOAD_KEY } from '@owox/internal-helpers';
import { createHash } from 'node:crypto';
import type { McpToolResult } from '../tools/mcp-tool.definition';
import type { McpLogContext } from './mcp-log-context';
import { REDACTED, REDACT_KEYS, redactMcpTelemetry as redact } from './mcp-telemetry-redaction';

export interface McpToolCallEventPayload {
  mcp_method_name: string;
  mcp_tool_name: string;
  mcp_tool_status: 'ok' | 'error';
  duration_ms: number;
  owox_project_id?: string;
  owox_user_id?: string;
  owox_client_id?: string;
  owox_request_id?: string;
  mcp_session_id?: string;
  mcp_protocol_version?: string;
  owox_client_user_agent?: string;
  owox_client_vendor?: string;
  trace_id?: string;
  traceparent?: string;
  owox_conversation_id?: string;
  owox_conversation_id_is_pseudo?: boolean;
  error_type?: string;
  error_message?: string;
  [OFFLOAD_KEY]?: Record<string, unknown>;
}

export class McpToolCallEvent extends BaseEvent<McpToolCallEventPayload> {
  get name() {
    return 'mcp.tool_call' as const;
  }
  constructor(payload: McpToolCallEventPayload, occurredAt: Date = new Date()) {
    super(payload, occurredAt);
  }
}

export interface BuildMcpToolCallEventParams {
  methodName: string;
  toolName: string;
  input: unknown;
  result?: McpToolResult;
  error?: unknown;
  durationMs: number;
  context: McpLogContext;
  executedSql?: string;
  meta?: Record<string, unknown>;
}

const MAX_META_VALUE_LEN = 1024;
const MAX_META_KEYS = 64;

/** _meta keys that carry a stable conversation id, in priority order. */
const CONVERSATION_ID_META_KEYS = ['openai/session'] as const;

function extractConversationId(meta?: Record<string, unknown>): string | undefined {
  if (!meta) return undefined;
  for (const key of CONVERSATION_ID_META_KEYS) {
    const v = meta[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/** Stable per user+project+UTC-day. Best-effort grouping when the client sends no conversation id. */
function computePseudoConversationId(
  userId: string | undefined,
  projectId: string | undefined,
  dateUtc: string,
  requestId: string | undefined
): string {
  // With no stable identity at all, seed with the per-request id so anonymous callers don't all
  // collapse into a single day-wide global trace.
  const identity =
    userId || projectId ? `${userId ?? 'anon'}|${projectId ?? 'none'}` : `req:${requestId ?? ''}`;
  const seed = `${identity}|${dateUtc}`;
  return createHash('sha256').update(seed).digest('hex').slice(0, 32);
}

function flattenMeta(meta?: Record<string, unknown>): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  if (!meta) return out;
  const entries = Object.entries(meta);
  for (const [k, v] of entries.slice(0, MAX_META_KEYS)) {
    if (v === undefined || v === null) continue;
    const key = `meta_${k.replace(/[^A-Za-z0-9_]/g, '_')}`;
    if (REDACT_KEYS.test(k)) {
      out[key] = REDACTED;
      continue;
    }
    // Coerce to string: a meta value numeric in one event and a string in another would split a fixed-schema sink column.
    const str = typeof v === 'string' ? v : JSON.stringify(redact(v));
    out[key] =
      str.length > MAX_META_VALUE_LEN ? `${str.slice(0, MAX_META_VALUE_LEN)}…[truncated]` : str;
  }
  if (entries.length > MAX_META_KEYS) out['meta_truncated'] = true;
  return out;
}

function normalizeError(error: unknown): { type: string; message: string } {
  const { type, message } =
    error instanceof Error
      ? { type: error.name, message: error.message }
      : { type: 'Error', message: String(error) };
  return { type, message };
}

/** The first text part is the error reason; later parts can contain diagnostic data. */
function extractResultErrorMessage(result?: McpToolResult): string {
  const textPart = result?.content?.find(
    (c): c is { type: 'text'; text: string } => c?.type === 'text' && typeof c.text === 'string'
  );
  const text = textPart?.text ?? '';
  return text || 'tool returned isError';
}

export function buildMcpToolCallEvent(p: BuildMcpToolCallEventParams): McpToolCallEvent {
  const occurredAt = new Date();
  const status: 'ok' | 'error' = p.error != null || p.result?.isError ? 'error' : 'ok';

  const realConversationId = extractConversationId(p.meta);
  const dateUtc = occurredAt.toISOString().slice(0, 10);
  const resolvedConversationId =
    realConversationId ??
    computePseudoConversationId(
      p.context.userId,
      p.context.projectId,
      dateUtc,
      p.context.requestId
    );

  const payload: McpToolCallEventPayload = {
    mcp_method_name: p.methodName,
    mcp_tool_name: p.toolName,
    mcp_tool_status: status,
    duration_ms: p.durationMs,
    owox_project_id: p.context.projectId,
    owox_user_id: p.context.userId,
    owox_client_id: p.context.clientId,
    owox_request_id: p.context.requestId,
    mcp_session_id: p.context.sessionId,
    mcp_protocol_version: p.context.protocolVersion,
    owox_client_user_agent: p.context.userAgent,
    owox_client_vendor: p.context.clientVendor,
    trace_id: deriveTraceId(resolvedConversationId),
    traceparent: p.context.traceparent,
    owox_conversation_id: resolvedConversationId,
    owox_conversation_id_is_pseudo: realConversationId === undefined,
  };

  if (status === 'error') {
    if (p.error != null) {
      const err = normalizeError(p.error);
      payload.error_type = err.type;
      payload.error_message = err.message;
    } else {
      // Structured tool error (result.isError) has no thrown error — hoist a short reason to the
      // top level so status=error always carries *why*, even when the result blob is offloaded.
      payload.error_type = 'ToolError';
      payload.error_message = extractResultErrorMessage(p.result);
    }
    // Mask before truncation so a cut token cannot escape value-based masking.
    const message = redact(payload.error_message, p.input) as string;
    payload.error_message =
      message.length > MAX_META_VALUE_LEN
        ? `${message.slice(0, MAX_META_VALUE_LEN)}…[truncated]`
        : message;
  }

  Object.assign(payload as unknown as Record<string, unknown>, flattenMeta(p.meta));

  const offload: Record<string, unknown> = {
    // Identity — makes each GCS file self-describing and joinable with the event log on owox_request_id.
    owox_request_id: p.context.requestId,
    owox_project_id: p.context.projectId,
    owox_conversation_id: resolvedConversationId,
    owox_conversation_id_is_pseudo: realConversationId === undefined,
    mcp_tool_name: p.toolName,
    mcp_method_name: p.methodName,
    mcp_tool_status: status,
    occurred_at: occurredAt.toISOString(),
    // Bulky (heterogeneous per tool → load into BQ JSON-typed columns).
    arguments: redact(p.input),
    result: redact(p.result?.structuredContent ?? p.result?.content, p.input),
  };
  if (p.executedSql) offload.sql = p.executedSql;
  payload[OFFLOAD_KEY] = offload;

  return new McpToolCallEvent(payload, occurredAt);
}
