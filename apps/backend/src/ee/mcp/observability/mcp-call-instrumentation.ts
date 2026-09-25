import { Injectable } from '@nestjs/common';
import type { ServerContext } from '@modelcontextprotocol/server';
import { OwoxEventDispatcher } from '../../../common/event-dispatcher/owox-event-dispatcher';
import { ClsContextService } from '../../../common/logger/cls-context.service';
import type { McpToolResult } from '../tools/mcp-tool.definition';
import { MCP_LOG_CONTEXT_KEY, type McpLogContext } from './mcp-log-context';
import { buildMcpToolCallEvent } from './mcp-tool-call-event';
import { MCP_TOOL_DIAGNOSTICS_KEY, type McpToolDiagnostics } from './mcp-tool-diagnostics';

/** The SDK passes each JSON-RPC message's own `_meta` in `ctx.mcpReq` (per message, not request-wide). */
export type SdkToolCallback = (input: unknown, ctx?: ServerContext) => Promise<McpToolResult>;

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
    return async (input, ctx) => {
      try {
        this.cls.set(MCP_TOOL_DIAGNOSTICS_KEY, {});
      } catch {
        /* never break the call */
      }
      const startedAt = Date.now();
      try {
        const result = await callback(input, ctx);
        this.emit(toolName, input, Date.now() - startedAt, { result }, ctx);
        return result;
      } catch (error) {
        this.emit(toolName, input, Date.now() - startedAt, { error }, ctx);
        throw error;
      }
    };
  }

  private emit(
    toolName: string,
    input: unknown,
    durationMs: number,
    outcome: { result?: McpToolResult; error?: unknown },
    ctx?: ServerContext
  ): void {
    try {
      const context: McpLogContext = this.cls.get(MCP_LOG_CONTEXT_KEY) ?? {};
      const diagnostics: McpToolDiagnostics = this.cls.get(MCP_TOOL_DIAGNOSTICS_KEY) ?? {};
      // Per-call: each JSON-RPC message carries its own _meta, so a batch's calls are attributed to
      // their own conversations (a request-wide slot would tag them all with the first message's).
      const meta = ctx?.mcpReq?._meta;
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
