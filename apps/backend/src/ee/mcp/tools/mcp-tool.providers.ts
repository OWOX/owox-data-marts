import { GetConnectorFieldsTool } from './connector/get-connector-fields.tool';
import { GetConnectorSpecificationTool } from './connector/get-connector-specification.tool';
import { ListConnectorsTool } from './connector/list-connectors.tool';
import { PreviewConnectorFieldOptionsTool } from './connector/preview-connector-field-options.tool';
import { PreviewConnectorFieldsTool } from './connector/preview-connector-fields.tool';
import { ActualizeDataMartSchemaTool } from './data-mart/actualize-data-mart-schema.tool';
import { CreateDataMartTool } from './data-mart/create-data-mart.tool';
import { DeleteDataMartTool } from './data-mart/delete-data-mart.tool';
import { GetDataMartChangeImpactTool } from './data-mart/get-data-mart-change-impact.tool';
import { GetDataMartSetupTool } from './data-mart/get-data-mart-setup.tool';
import { ListSetupDataMartsTool } from './data-mart/list-setup-data-marts.tool';
import { PublishDataMartTool } from './data-mart/publish-data-mart.tool';
import { SetDataMartContextsTool } from './data-mart/set-data-mart-contexts.tool';
import { SetDataMartOwnersTool } from './data-mart/set-data-mart-owners.tool';
import { SetDataMartSharingTool } from './data-mart/set-data-mart-sharing.tool';
import { UpdateDataMartDefinitionTool } from './data-mart/update-data-mart-definition.tool';
import { UpdateDataMartDescriptionTool } from './data-mart/update-data-mart-description.tool';
import { UpdateDataMartIconTool } from './data-mart/update-data-mart-icon.tool';
import { UpdateDataMartSchemaTool } from './data-mart/update-data-mart-schema.tool';
import { UpdateDataMartTitleTool } from './data-mart/update-data-mart-title.tool';
import { ValidateDataMartTool } from './data-mart/validate-data-mart.tool';
import { CancelDataMartRunTool } from './data-mart-execution/cancel-data-mart-run.tool';
import { CreateDataMartRunScheduleTool } from './data-mart-execution/create-data-mart-run-schedule.tool';
import { DeleteDataMartRunScheduleTool } from './data-mart-execution/delete-data-mart-run-schedule.tool';
import { GetDataMartRunTool } from './data-mart-execution/get-data-mart-run.tool';
import { ListDataMartRunSchedulesTool } from './data-mart-execution/list-data-mart-run-schedules.tool';
import { ListDataMartRunsTool } from './data-mart-execution/list-data-mart-runs.tool';
import { RunDataMartTool } from './data-mart-execution/run-data-mart.tool';
import { UpdateDataMartRunScheduleTool } from './data-mart-execution/update-data-mart-run-schedule.tool';
import { CreateDataMartRelationshipTool } from './data-mart-model/create-data-mart-relationship.tool';
import { DeleteDataMartRelationshipTool } from './data-mart-model/delete-data-mart-relationship.tool';
import { ListDataMartRelationshipsTool } from './data-mart-model/list-data-mart-relationships.tool';
import { PreviewDataMartTool } from './data-mart-model/preview-data-mart.tool';
import { UpdateDataMartRelationshipTool } from './data-mart-model/update-data-mart-relationship.tool';
import { ListContextsTool } from './list-contexts.tool';
import { GetGuideTool } from './get-guide.tool';
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
import { ListDestinationsTool } from './destination/list-destinations.tool';
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
import { AddDestinationTool } from './destination/add-destination.tool';
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
import { ListCredentialDefinitionsTool } from './credential/list-credential-definitions.tool';
import { ListCredentialsTool } from './credential/list-credentials.tool';
import { GetCredentialTool } from './credential/get-credential.tool';
import { UpdateCredentialTool } from './credential/update-credential.tool';
import { ValidateCredentialTool } from './credential/validate-credential.tool';
import { ConsentCredentialDefinitionTool } from './credential/consent-credential-definition.tool';
import { DeleteCredentialTool } from './credential/delete-credential.tool';
import { StartCredentialSetupTool } from './credential/start-credential-setup.tool';
import { GetCredentialSetupStatusTool } from './credential/get-credential-setup-status.tool';
import { ListStoragesTool } from './storage/list-storages.tool';
import { GetStorageTool } from './storage/get-storage.tool';
import { CreateStorageTool } from './storage/create-storage.tool';
import { UpdateStorageTool } from './storage/update-storage.tool';
import { SetStorageAccessTool } from './storage/set-storage-access.tool';
import { ValidateStorageAccessTool } from './storage/validate-storage-access.tool';
import { ListStorageResourcesTool } from './storage/list-storage-resources.tool';
import { DeleteStorageTool } from './storage/delete-storage.tool';
import { GetDestinationTool } from './destination/get-destination.tool';
import { UpdateDestinationTool } from './destination/update-destination.tool';
import { SetDestinationAccessTool } from './destination/set-destination-access.tool';
import { GetDestinationImpactTool } from './destination/get-destination-impact.tool';
import { DeleteDestinationTool } from './destination/delete-destination.tool';
import { RotateDestinationSecretKeyTool } from './destination/rotate-destination-secret-key.tool';

export const MCP_TOOL_PROVIDER_CLASSES: Array<Type<McpToolDefinition>> = [
  GetConnectorFieldsTool,
  GetConnectorSpecificationTool,
  ListConnectorsTool,
  PreviewConnectorFieldOptionsTool,
  PreviewConnectorFieldsTool,
  ActualizeDataMartSchemaTool,
  CreateDataMartTool,
  DeleteDataMartTool,
  GetDataMartChangeImpactTool,
  GetDataMartSetupTool,
  ListSetupDataMartsTool,
  PublishDataMartTool,
  SetDataMartContextsTool,
  SetDataMartOwnersTool,
  SetDataMartSharingTool,
  UpdateDataMartDefinitionTool,
  UpdateDataMartDescriptionTool,
  UpdateDataMartIconTool,
  UpdateDataMartSchemaTool,
  UpdateDataMartTitleTool,
  ValidateDataMartTool,
  CancelDataMartRunTool,
  CreateDataMartRunScheduleTool,
  DeleteDataMartRunScheduleTool,
  GetDataMartRunTool,
  ListDataMartRunSchedulesTool,
  ListDataMartRunsTool,
  RunDataMartTool,
  UpdateDataMartRunScheduleTool,
  CreateDataMartRelationshipTool,
  DeleteDataMartRelationshipTool,
  ListDataMartRelationshipsTool,
  PreviewDataMartTool,
  UpdateDataMartRelationshipTool,

  ListStoragesTool,
  GetStorageTool,
  CreateStorageTool,
  UpdateStorageTool,
  SetStorageAccessTool,
  ValidateStorageAccessTool,
  ListStorageResourcesTool,
  DeleteStorageTool,
  ListCredentialDefinitionsTool,
  ListCredentialsTool,
  GetCredentialTool,
  UpdateCredentialTool,
  ValidateCredentialTool,
  ConsentCredentialDefinitionTool,
  DeleteCredentialTool,
  StartCredentialSetupTool,
  GetCredentialSetupStatusTool,
  ListContextsTool,
  GetGuideTool,
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
  GetDestinationTool,
  UpdateDestinationTool,
  SetDestinationAccessTool,
  GetDestinationImpactTool,
  DeleteDestinationTool,
  RotateDestinationSecretKeyTool,
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
