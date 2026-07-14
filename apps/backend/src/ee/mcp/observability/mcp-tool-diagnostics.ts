import { createClsKey } from '../../../common/logger/cls-context.service';

/**
 * Per-call diagnostics a tool can hand to instrumentation (e.g. executed SQL).
 * SEPARATE from McpLogContext on purpose: it is NOT auto-attached to every pino line
 * (would bloat logs), only read once when building the tool-call event → offloaded to GCS.
 */
export interface McpToolDiagnostics {
  executedSql?: string;
}

export const MCP_TOOL_DIAGNOSTICS_KEY = createClsKey<McpToolDiagnostics>('McpToolDiagnostics');
