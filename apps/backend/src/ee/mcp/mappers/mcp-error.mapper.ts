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
