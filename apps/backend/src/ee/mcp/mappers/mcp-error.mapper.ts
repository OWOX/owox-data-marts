import type { McpToolResult } from '../tools/mcp-tool.definition';

export function toToolError(error: unknown): McpToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: error instanceof Error ? error.message : 'MCP tool execution failed',
      },
    ],
  };
}

export function toStructuredToolError(errorCode: string, message: string): McpToolResult {
  const payload = { error_code: errorCode, message };
  return {
    isError: true,
    structuredContent: payload,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}
