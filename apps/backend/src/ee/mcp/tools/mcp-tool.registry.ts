import { Inject, Injectable } from '@nestjs/common';
import { MCP_TOOL_DEFINITIONS, type McpToolDefinition } from './mcp-tool.definition';

@Injectable()
export class McpToolRegistry {
  private readonly toolsByName = new Map<string, McpToolDefinition>();

  constructor(
    @Inject(MCP_TOOL_DEFINITIONS)
    private readonly tools: McpToolDefinition[] = []
  ) {
    for (const tool of tools) {
      if (this.toolsByName.has(tool.name)) {
        throw new Error(`Duplicate MCP tool name: ${tool.name}`);
      }
      this.toolsByName.set(tool.name, tool);
    }
  }

  getTools(): McpToolDefinition[] {
    return this.tools;
  }

  getTool(name: string): McpToolDefinition | undefined {
    return this.toolsByName.get(name);
  }
}
