import type { Provider, Type } from '@nestjs/common';
import { CreateReportRunScheduleTool } from './create-report-run-schedule.tool';
import { ListDataMartsTool } from './data-mart-catalog.tool';
import { DeleteReportRunScheduleTool } from './delete-report-run-schedule.tool';
import { ListDestinationsTool } from './list-destinations.tool';
import { ListReportRunSchedulesTool } from './list-report-run-schedules.tool';
import { MCP_TOOL_DEFINITIONS, type McpToolDefinition } from './mcp-tool.definition';
import { GetProjectContextTool } from './project-context.tool';
import { SearchDataMartsTool } from './search-data-marts.tool';
import { UpdateReportRunScheduleTool } from './update-report-run-schedule.tool';

export const MCP_TOOL_PROVIDER_CLASSES: Array<Type<McpToolDefinition>> = [
  ListDataMartsTool,
  SearchDataMartsTool,
  GetProjectContextTool,
  ListDestinationsTool,
  ListReportRunSchedulesTool,
  CreateReportRunScheduleTool,
  UpdateReportRunScheduleTool,
  DeleteReportRunScheduleTool,
];

export const MCP_TOOL_DEFINITIONS_PROVIDER: Provider = {
  provide: MCP_TOOL_DEFINITIONS,
  useFactory: (...tools: McpToolDefinition[]) => tools,
  inject: MCP_TOOL_PROVIDER_CLASSES,
};
