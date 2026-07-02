import type { Provider, Type } from '@nestjs/common';
import { ListDataMartsTool } from './data-mart-catalog.tool';
import { GetDataMartDetailsTool } from './data-mart-details.tool';
import { ListDestinationsTool } from './list-destinations.tool';
import { MCP_TOOL_DEFINITIONS, type McpToolDefinition } from './mcp-tool.definition';
import { GetProjectContextTool } from './project-context.tool';
import { SearchDataMartsTool } from './search-data-marts.tool';

export const MCP_TOOL_PROVIDER_CLASSES: Array<Type<McpToolDefinition>> = [
  ListDataMartsTool,
  SearchDataMartsTool,
  GetDataMartDetailsTool,
  GetProjectContextTool,
  ListDestinationsTool,
];

export const MCP_TOOL_DEFINITIONS_PROVIDER: Provider = {
  provide: MCP_TOOL_DEFINITIONS,
  useFactory: (...tools: McpToolDefinition[]) => tools,
  inject: MCP_TOOL_PROVIDER_CLASSES,
};
