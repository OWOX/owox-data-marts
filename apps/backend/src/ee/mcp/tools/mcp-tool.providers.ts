import type { Provider, Type } from '@nestjs/common';
import { CreateReportRunScheduleTool } from './create-report-run-schedule.tool';
import { AddReportTool } from './add-report.tool';
import { ConnectorDetailsTool } from './connector-details.tool';
import { ConnectorRunStatusTool } from './connector-run-status.tool';
import { ConnectorDeleteTool } from './connector-delete.tool';
import { ConnectorSetVersionTool } from './connector-set-version.tool';
import { ConnectorVersionsTool } from './connector-versions.tool';
import { ListDataMartsTool } from './data-mart-catalog.tool';
import { GetDataMartDetailsTool } from './data-mart-details.tool';
import { DeleteReportTool } from './delete-report.tool';
import { DeleteReportRunScheduleTool } from './delete-report-run-schedule.tool';
import { GetDataMartReportsTool } from './get-data-mart-reports.tool';
import { ConnectorManifestSchemaTool } from './connector-manifest-schema.tool';
import { GetReportRunStatusTool } from './get-report-run-status.tool';
import { ConnectorListTool } from './connector-list.tool';
import { ListDestinationsTool } from './list-destinations.tool';
import { ListReportRunSchedulesTool } from './list-report-run-schedules.tool';
import { MCP_TOOL_DEFINITIONS, type McpToolDefinition } from './mcp-tool.definition';
import { GetProjectContextTool } from './project-context.tool';
import { ConnectorPublishTool } from './connector-publish.tool';
import { QueryDataMartTool } from './query-data-mart.tool';
import { RunReportTool } from './run-report.tool';
import { SearchDataMartsTool } from './search-data-marts.tool';
import { SummarizeDataCatalogTool } from './summarize-data-catalog.tool';
import { ConnectorRunDataMartTool } from './connector-run-data-mart.tool';
import { ConnectorSearchTool } from './connector-search.tool';
import { ConnectorTestTool } from './connector-test.tool';
import { UpdateReportRunScheduleTool } from './update-report-run-schedule.tool';
import { UpdateReportTool } from './update-report.tool';
import { AddDestinationTool } from './add-destination.tool';

export const MCP_TOOL_PROVIDER_CLASSES: Array<Type<McpToolDefinition>> = [
  ConnectorManifestSchemaTool,
  SummarizeDataCatalogTool,
  ListDataMartsTool,
  SearchDataMartsTool,
  GetDataMartDetailsTool,
  GetProjectContextTool,
  ConnectorListTool,
  ConnectorSearchTool,
  ConnectorDetailsTool,
  ConnectorTestTool,
  ConnectorPublishTool,
  ListDestinationsTool,
  GetDataMartReportsTool,
  ListReportRunSchedulesTool,
  CreateReportRunScheduleTool,
  UpdateReportRunScheduleTool,
  DeleteReportRunScheduleTool,
  QueryDataMartTool,
  AddReportTool,
  UpdateReportTool,
  DeleteReportTool,
  AddDestinationTool,
  RunReportTool,
  GetReportRunStatusTool,
  ConnectorRunDataMartTool,
  ConnectorRunStatusTool,
  ConnectorDeleteTool,
  ConnectorVersionsTool,
  ConnectorSetVersionTool,
];

export const MCP_TOOL_DEFINITIONS_PROVIDER: Provider = {
  provide: MCP_TOOL_DEFINITIONS,
  useFactory: (...tools: McpToolDefinition[]) => tools,
  inject: MCP_TOOL_PROVIDER_CLASSES,
};
