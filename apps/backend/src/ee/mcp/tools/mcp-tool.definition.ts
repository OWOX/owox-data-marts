import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { McpScope } from '@owox/idp-protocol';
import type { ZodRawShape } from 'zod';
import type { McpAuthContext } from '../auth/mcp-auth-context';

export const MCP_TOOL_DEFINITIONS = Symbol('MCP_TOOL_DEFINITIONS');

export type McpToolResult = CallToolResult;

export function jsonToolResult(structuredContent: Record<string, unknown>): McpToolResult {
  return {
    structuredContent,
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
  };
}

export interface McpToolDefinition<TInput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly zodSchema: ZodRawShape;
  readonly outputSchema?: ZodRawShape;
  readonly annotations?: ToolAnnotations;
  readonly requiredScopes: McpScope[];
  handler(input: TInput, context: McpAuthContext, signal?: AbortSignal): Promise<McpToolResult>;
}
