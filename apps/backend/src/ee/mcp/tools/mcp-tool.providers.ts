import { ListContextsTool } from './list-contexts.tool';
import type { Provider, Type } from '@nestjs/common';
import { CreateReportRunScheduleTool } from './create-report-run-schedule.tool';
import { AddReportTool } from './add-report.tool';
import { ListDataMartsTool } from './data-mart-catalog.tool';
import { GetDataMartDetailsTool } from './data-mart-details.tool';
import { DeleteReportTool } from './delete-report.tool';
import { DeleteReportRunScheduleTool } from './delete-report-run-schedule.tool';
import { GetDataMartReportsTool } from './get-data-mart-reports.tool';
import { GetReportOutputSchemaTool } from './get-report-output-schema.tool';
import { GetReportRunStatusTool } from './get-report-run-status.tool';
import { ListDestinationsTool } from './list-destinations.tool';
import { ListReportRunSchedulesTool } from './list-report-run-schedules.tool';
import { MCP_TOOL_DEFINITIONS, type McpToolDefinition } from './mcp-tool.definition';
import { GetProjectContextTool } from './project-context.tool';
import { QueryDataMartTool } from './query-data-mart.tool';
import { RunReportTool } from './run-report.tool';
import { SearchDataMartsTool } from './search-data-marts.tool';
import { SearchReportsTool } from './search-reports.tool';
import { SummarizeDataCatalogTool } from './summarize-data-catalog.tool';
import { UpdateReportRunScheduleTool } from './update-report-run-schedule.tool';
import { UpdateReportTool } from './update-report.tool';
import { AddDestinationTool } from './add-destination.tool';
import { CreateContextTool } from './context/create-context.tool';
import { UpdateContextMetadataTool } from './context/update-context-metadata.tool';
import { GetContextImpactTool } from './context/get-context-impact.tool';
import { SetContextMembersTool } from './context/set-context-members.tool';
import { DeleteContextTool } from './context/delete-context.tool';
import { ListProjectMembersTool } from './project/list-project-members.tool';
import { GetProjectSettingsTool } from './project/get-project-settings.tool';
import { UpdateProjectDescriptionTool } from './project/update-project-description.tool';

import { ListCustomConnectorsTool } from './custom-connector/list-custom-connectors.tool';
import { GetCustomConnectorTool } from './custom-connector/get-custom-connector.tool';
import { CreateCustomConnectorTool } from './custom-connector/create-custom-connector.tool';
import { UpdateCustomConnectorTool } from './custom-connector/update-custom-connector.tool';
import { GetCustomConnectorVersionTool } from './custom-connector/get-custom-connector-version.tool';
import { SaveCustomConnectorDraftTool } from './custom-connector/save-custom-connector-draft.tool';
import { TestCustomConnectorTool } from './custom-connector/test-custom-connector.tool';
import { PublishCustomConnectorTool } from './custom-connector/publish-custom-connector.tool';
import { ActivateCustomConnectorVersionTool } from './custom-connector/activate-custom-connector-version.tool';
import { DeleteCustomConnectorTool } from './custom-connector/delete-custom-connector.tool';
import { GetCustomConnectorSpecificationTool } from './custom-connector/get-custom-connector-specification.tool';
import { GetCustomConnectorFieldsTool } from './custom-connector/get-custom-connector-fields.tool';

export const MCP_TOOL_PROVIDER_CLASSES: Array<Type<McpToolDefinition>> = [
  ListContextsTool,
  ListCustomConnectorsTool,
  GetCustomConnectorTool,
  CreateCustomConnectorTool,
  UpdateCustomConnectorTool,
  GetCustomConnectorVersionTool,
  SaveCustomConnectorDraftTool,
  TestCustomConnectorTool,
  PublishCustomConnectorTool,
  ActivateCustomConnectorVersionTool,
  DeleteCustomConnectorTool,
  GetCustomConnectorSpecificationTool,
  GetCustomConnectorFieldsTool,
  CreateContextTool,
  UpdateContextMetadataTool,
  GetContextImpactTool,
  SetContextMembersTool,
  DeleteContextTool,
  ListProjectMembersTool,
  GetProjectSettingsTool,
  UpdateProjectDescriptionTool,
  SummarizeDataCatalogTool,
  ListDataMartsTool,
  SearchDataMartsTool,
  SearchReportsTool,
  GetDataMartDetailsTool,
  GetProjectContextTool,
  ListDestinationsTool,
  GetDataMartReportsTool,
  GetReportOutputSchemaTool,
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
];

export const MCP_TOOL_DEFINITIONS_PROVIDER: Provider = {
  provide: MCP_TOOL_DEFINITIONS,
  useFactory: (...tools: McpToolDefinition[]) => tools,
  inject: MCP_TOOL_PROVIDER_CLASSES,
};
