import { ListContextsTool } from './context/list-contexts.tool';
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
import { GetProjectContextTool } from './project/project-context.tool';
import { QueryDataMartTool } from './query-data-mart.tool';
import { RunReportTool } from './run-report.tool';
import { SearchDataMartsTool } from './search-data-marts.tool';
import { SearchReportsTool } from './search-reports.tool';
import { SummarizeDataCatalogTool } from './summarize-data-catalog.tool';
import { UpdateReportRunScheduleTool } from './update-report-run-schedule.tool';
import { UpdateReportTool } from './update-report.tool';
import { AddDestinationTool } from './add-destination.tool';

import { GetDataMartConfigurationTool } from './data-mart/get-data-mart-configuration.tool';
import { CreateDataMartTool } from './data-mart/create-data-mart.tool';
import { UpdateDataMartMetadataTool } from './data-mart/update-data-mart-metadata.tool';
import { UpdateDataMartDefinitionTool } from './data-mart/update-data-mart-definition.tool';
import { UpdateDataMartSchemaTool } from './data-mart/update-data-mart-schema.tool';
import { UpdateDataMartOwnersTool } from './data-mart/update-data-mart-owners.tool';
import { UpdateDataMartAvailabilityTool } from './data-mart/update-data-mart-availability.tool';
import { UpdateDataMartContextsTool } from './data-mart/update-data-mart-contexts.tool';
import { UpdateDataMartBlendedFieldsConfigTool } from './data-mart/update-data-mart-blended-fields-config.tool';
import { PublishDataMartTool } from './data-mart/publish-data-mart.tool';
import { DeleteDataMartTool } from './data-mart/delete-data-mart.tool';
import { ValidateDataMartDefinitionTool } from './data-mart/validate-data-mart-definition.tool';
import { ValidateDataMartFormulaTool } from './data-mart/validate-data-mart-formula.tool';
import { ActualizeDataMartSchemaTool } from './data-mart/actualize-data-mart-schema.tool';
import { ListDataStoragesTool } from './storage/list-data-storages.tool';
import { ListStorageResourcesTool } from './storage/list-storage-resources.tool';
import { CreateContextTool } from './context/create-context.tool';
import { UpdateContextTool } from './context/update-context.tool';
import { GetContextImpactTool } from './context/get-context-impact.tool';
import { DeleteContextTool } from './context/delete-context.tool';
import { SetContextMembersTool } from './context/set-context-members.tool';
import { GetProjectSettingsTool } from './project/get-project-settings.tool';
import { ListProjectMembersTool } from './project/list-project-members.tool';
import { UpdateProjectDescriptionTool } from './project/update-project-description.tool';
import { CreateDataMartRelationshipTool } from './data-mart/create-data-mart-relationship.tool';
import { UpdateDataMartRelationshipTool } from './data-mart/update-data-mart-relationship.tool';
import { DeleteDataMartRelationshipTool } from './data-mart/delete-data-mart-relationship.tool';
import { GetDataMartRelationshipGraphTool } from './data-mart/get-data-mart-relationship-graph.tool';
import { ListConnectorsTool } from './connector/list-connectors.tool';
import { GetConnectorSpecificationTool } from './connector/get-connector-specification.tool';
import { GetConnectorFieldsTool } from './connector/get-connector-fields.tool';
import { ListConnectorConfigurationsTool } from './connector/list-connector-configurations.tool';
import { PreviewConnectorFieldsTool } from './connector/preview-connector-fields.tool';
import { PreviewConnectorFieldOptionsTool } from './connector/preview-connector-field-options.tool';

export const MCP_TOOL_PROVIDER_CLASSES: Array<Type<McpToolDefinition>> = [
  ListContextsTool,
  ListConnectorsTool,
  GetConnectorSpecificationTool,
  GetConnectorFieldsTool,
  ListConnectorConfigurationsTool,
  PreviewConnectorFieldsTool,
  PreviewConnectorFieldOptionsTool,
  GetDataMartConfigurationTool,
  CreateDataMartTool,
  UpdateDataMartMetadataTool,
  UpdateDataMartDefinitionTool,
  UpdateDataMartSchemaTool,
  UpdateDataMartOwnersTool,
  UpdateDataMartAvailabilityTool,
  UpdateDataMartContextsTool,
  UpdateDataMartBlendedFieldsConfigTool,
  PublishDataMartTool,
  DeleteDataMartTool,
  ValidateDataMartDefinitionTool,
  ValidateDataMartFormulaTool,
  ActualizeDataMartSchemaTool,
  ListDataStoragesTool,
  ListStorageResourcesTool,
  CreateContextTool,
  UpdateContextTool,
  GetContextImpactTool,
  DeleteContextTool,
  SetContextMembersTool,
  GetProjectSettingsTool,
  ListProjectMembersTool,
  UpdateProjectDescriptionTool,
  CreateDataMartRelationshipTool,
  UpdateDataMartRelationshipTool,
  DeleteDataMartRelationshipTool,
  GetDataMartRelationshipGraphTool,
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
