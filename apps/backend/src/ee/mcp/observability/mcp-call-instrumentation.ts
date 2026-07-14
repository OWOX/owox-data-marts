import { Injectable } from '@nestjs/common';
import { OwoxEventDispatcher } from '../../../common/event-dispatcher/owox-event-dispatcher';
import { ClsContextService } from '../../../common/logger/cls-context.service';
import type { McpToolResult } from '../tools/mcp-tool.definition';
import { MCP_LOG_CONTEXT_KEY, type McpLogContext } from './mcp-log-context';
import { buildMcpToolCallEvent } from './mcp-tool-call-event';
import { MCP_TOOL_DIAGNOSTICS_KEY, type McpToolDiagnostics } from './mcp-tool-diagnostics';

/** The SDK passes each JSON-RPC message's own `_meta` in `extra` (per message, not request-wide). */
export type SdkToolCallback = (
  input: unknown,
  extra?: { signal?: AbortSignal; _meta?: Record<string, unknown> }
) => Promise<McpToolResult>;

/**
 * Wraps an MCP SDK tool callback to emit one structured event per call.
 * Best-effort: never changes the handler's result/error and never throws.
 */
@Injectable()
export class McpCallInstrumentation {
  constructor(
    private readonly dispatcher: OwoxEventDispatcher,
    private readonly cls: ClsContextService
  ) {}

  wrap(toolName: string, callback: SdkToolCallback): SdkToolCallback {
    return async (input, extra) => {
      try {
        this.cls.set(MCP_TOOL_DIAGNOSTICS_KEY, {});
      } catch {
        /* never break the call */
      }
      const startedAt = Date.now();
      try {
        const result = await callback(input, extra);
        this.emit(toolName, input, Date.now() - startedAt, { result }, extra);
        return result;
      } catch (error) {
        this.emit(toolName, input, Date.now() - startedAt, { error }, extra);
        throw error;
      }
    };
  }

  private emit(
    toolName: string,
    input: unknown,
    durationMs: number,
    outcome: { result?: McpToolResult; error?: unknown },
    extra?: { _meta?: Record<string, unknown> }
  ): void {
    try {
      const context: McpLogContext = this.cls.get(MCP_LOG_CONTEXT_KEY) ?? {};
      const diagnostics: McpToolDiagnostics = this.cls.get(MCP_TOOL_DIAGNOSTICS_KEY) ?? {};
      // Per-call: each JSON-RPC message carries its own _meta, so a batch's calls are attributed to
      // their own conversations (a request-wide slot would tag them all with the first message's).
      const meta = extra?._meta;
      const event = buildMcpToolCallEvent({
        methodName: 'tools/call',
        toolName,
        input,
        result: outcome.result,
        error: outcome.error,
        durationMs,
        context,
        executedSql: diagnostics.executedSql,
        meta,
      });
      this.dispatcher.publishExternalSafely(event);
    } catch {
      /* never break the call */
    }
  }
}
