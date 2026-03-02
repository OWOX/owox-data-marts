import { TypeOrmModule } from '@nestjs/typeorm';
import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { DataMartController } from './controllers/data-mart.controller';
import { DataStorageController } from './controllers/data-storage.controller';
import { DataDestinationController } from './controllers/data-destination.controller';
import { LookerStudioConnectorController } from './controllers/external/looker-studio-connector.controller';
import { MarkdownParserController } from './controllers/markdown-parser.controller';
import { ReportController } from './controllers/report.controller';
import { InsightController } from './controllers/insight.controller';
import { AiAssistantController } from './controllers/ai-assistant.controller';
import { AiAssistantRunTriggerController } from './controllers/ai-assistant-run-trigger.controller';
import { InsightArtifactController } from './controllers/insight-artifact.controller';
import { InsightArtifactSqlPreviewTriggerController } from './controllers/insight-artifact-sql-preview-trigger.controller';
import { InsightTemplateController } from './controllers/insight-template.controller';
import { ScheduledTriggerController } from './controllers/scheduled-trigger.controller';
import { SyncDataMartsByGcpTrigger } from './entities/legacy-data-marts/sync-data-marts-by-gcp-trigger.entity';
import { SyncGcpStoragesForProjectTrigger } from './entities/legacy-data-marts/sync-gcp-storages-for-project-trigger.entity';
import { ConsumptionTrackingService } from './services/consumption-tracking.service';
import { SyncDataMartsByGcpTriggerHandler } from './services/legacy-data-marts/sync-data-marts-by-gcp-trigger.handler';
import { SyncGcpStoragesForProjectTriggerHandler } from './services/legacy-data-marts/sync-gcp-storages-for-project-trigger.handler';
import { ProjectBalanceService } from './services/project-balance.service';
import { LegacyDataMartsService } from './services/legacy-data-marts/legacy-data-marts.service';
import { ReportDataCacheService } from './services/report-data-cache.service';
import { UserProjectionsFetcherService } from './services/user-projections-fetcher.service';
import { CreateDataMartService } from './use-cases/create-data-mart.service';
import { DeleteLegacyDataMartService } from './use-cases/legacy-data-marts/delete-legacy-data-mart.service';
import { SyncLegacyGcpStoragesForProjectService } from './use-cases/legacy-data-marts/sync-legacy-gcp-storages-for-project.service';
import { ListDataMartsService } from './use-cases/list-data-marts.service';
import { ListDataMartsByConnectorNameService } from './use-cases/list-data-marts-by-connector-name.service';
import { GetDataMartService } from './use-cases/get-data-mart.service';
import { DataMartMapper } from './mappers/data-mart.mapper';
import { ScheduledTriggerMapper } from './mappers/scheduled-trigger.mapper';
import { DataStorageService } from './services/data-storage.service';
import { DataStorageMapper } from './mappers/data-storage.mapper';
import { DataDestinationService } from './services/data-destination.service';
import { DataDestinationMapper } from './mappers/data-destination.mapper';
import { ReportMapper } from './mappers/report.mapper';
import { GetDataStorageService } from './use-cases/get-data-storage.service';
import { CreateDataStorageService } from './use-cases/create-data-storage.service';
import { UpdateDataStorageService } from './use-cases/update-data-storage.service';
import { GetDataDestinationService } from './use-cases/get-data-destination.service';
import { CreateDataDestinationService } from './use-cases/create-data-destination.service';
import { UpdateDataDestinationService } from './use-cases/update-data-destination.service';
import { CreateReportService } from './use-cases/create-report.service';
import { GetReportService } from './use-cases/get-report.service';
import { ListReportsByDataMartService } from './use-cases/list-reports-by-data-mart.service';
import { ListReportsByProjectService } from './use-cases/list-reports-by-project.service';
import { DeleteReportService } from './use-cases/delete-report.service';
import { RunReportService } from './use-cases/run-report.service';
import { UpdateReportService } from './use-cases/update-report.service';
import { CreateScheduledTriggerService } from './use-cases/create-scheduled-trigger.service';
import { GetScheduledTriggerService } from './use-cases/get-scheduled-trigger.service';
import { ListScheduledTriggersService } from './use-cases/list-scheduled-triggers.service';
import { UpdateScheduledTriggerService } from './use-cases/update-scheduled-trigger.service';
import { DeleteScheduledTriggerService } from './use-cases/delete-scheduled-trigger.service';
import { DataMart } from './entities/data-mart.entity';
import { DataStorage } from './entities/data-storage.entity';
import { DataMartRun } from './entities/data-mart-run.entity';
import { AiAssistantSession } from './entities/ai-assistant-session.entity';
import { AiAssistantMessage } from './entities/ai-assistant-message.entity';
import { AiAssistantContext } from './entities/ai-assistant-context.entity';
import { AiAssistantRunTrigger } from './entities/ai-assistant-run-trigger.entity';
import { AiAssistantApplyAction } from './entities/ai-assistant-apply-action.entity';
import { dataStorageFacadesProviders } from './data-storage-types/data-storage-facades';
import { dataStorageResolverProviders } from './data-storage-types/data-storage-providers';
import { dataDestinationFacadesProviders } from './data-destination-types/data-destination-facades';
import { dataDestinationResolverProviders } from './data-destination-types/data-destination-providers';
import { DataDestinationSecretKeyRotatorFacade } from './data-destination-types/facades/data-destination-secret-key-rotator.facade';
import { scheduledTriggerProviders } from './scheduled-trigger-types/scheduled-trigger-providers';
import { scheduledTriggerFacadesProviders } from './scheduled-trigger-types/scheduled-trigger-facades';
import { UpdateDataMartDefinitionService } from './use-cases/update-data-mart-definition.service';
import { DataMartService } from './services/data-mart.service';
import { ScheduledTriggerService } from './services/scheduled-trigger.service';
import { PublishDataMartService } from './use-cases/publish-data-mart.service';
import { UpdateDataMartDescriptionService } from './use-cases/update-data-mart-description.service';
import { UpdateDataMartTitleService } from './use-cases/update-data-mart-title.service';
import { ListDataStoragesService } from './use-cases/list-data-storages.service';
import { ListDataDestinationsService } from './use-cases/list-data-destinations.service';
import { DeleteDataStorageService } from './use-cases/delete-data-storage.service';
import { DeleteDataDestinationService } from './use-cases/delete-data-destination.service';
import { PublishDataStorageDraftsService } from './use-cases/publish-data-storage-drafts.service';
import { RotateSecretKeyService } from './use-cases/rotate-secret-key.service';
import { DeleteDataMartService } from './use-cases/delete-data-mart.service';
import { DataDestination } from './entities/data-destination.entity';
import { Report } from './entities/report.entity';
import { Insight } from './entities/insight.entity';
import { InsightArtifact } from './entities/insight-artifact.entity';
import { InsightArtifactSqlPreviewTrigger } from './entities/insight-artifact-sql-preview-trigger.entity';
import { InsightTemplate } from './entities/insight-template.entity';
import { InsightTemplateSourceEntity } from './entities/insight-template-source.entity';
import { ConnectorController } from './controllers/connector.controller';
import { AvailableConnectorService } from './use-cases/connector/available-connector.service';
import { ConnectorService } from './services/connector.service';
import { ConnectorExecutionService } from './services/connector-execution.service';
import { ConnectorMapper } from './mappers/connector.mapper';
import { SpecificationConnectorService } from './use-cases/connector/specification-connector.service';
import { FieldsConnectorService } from './use-cases/connector/fields-connector.service';
import { RunDataMartService } from './use-cases/run-data-mart.service';
import { CancelDataMartRunService } from './use-cases/cancel-data-mart-run.service';
import { ValidateDataMartDefinitionService } from './use-cases/validate-data-mart-definition.service';
import { ActualizeDataMartSchemaService } from './use-cases/actualize-data-mart-schema.service';
import { UpdateDataMartSchemaService } from './use-cases/update-data-mart-schema.service';
import { SqlDryRunService } from './use-cases/sql-dry-run.service';
import { DataMartSchemaParserFacade } from './data-storage-types/facades/data-mart-schema-parser-facade.service';
import { DataMartScheduledTrigger } from './entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggersHandlerService } from './services/scheduled-triggers-handler.service';
import { ReportService } from './services/report.service';
import { InsightService } from './services/insight.service';
import { InsightArtifactService } from './services/insight-artifact.service';
import { InsightArtifactSqlPreviewTriggerHandlerService } from './services/insight-artifact-sql-preview-trigger-handler.service';
import { InsightArtifactSqlPreviewTriggerService } from './services/insight-artifact-sql-preview-trigger.service';
import { InsightTemplateService } from './services/insight-template.service';
import { InsightTemplateValidationService } from './services/insight-template-validation.service';
import { TemplatePlaceholderValidator } from './services/template-edit-placeholder-tags/template-placeholder-validator.service';
import { TemplateTagContractValidator } from './services/template-edit-placeholder-tags/template-tag-contract-validator.service';
import { TemplateTagRenderer } from './services/template-edit-placeholder-tags/template-tag-renderer.service';
import { TemplateTemplateAssembler } from './services/template-edit-placeholder-tags/template-template-assembler.service';
import { TemplateFinalValidator } from './services/template-edit-placeholder-tags/template-final-validator.service';
import { TemplatePlaceholderTagsRendererService } from './services/template-edit-placeholder-tags/template-placeholder-tags-renderer.service';
import { TemplateFullReplaceApplyService } from './services/template-edit-placeholder-tags/template-full-replace-apply.service';
import { ConnectorOutputCaptureService } from './connector-types/connector-message/services/connector-output-capture.service';
import { ConnectorMessageParserService } from './connector-types/connector-message/services/connector-message-parser.service';
import { ConnectorStateService } from './connector-types/connector-message/services/connector-state.service';
import { ConnectorState } from './entities/connector-state.entity';
import { ReportDataCache } from './entities/report-data-cache.entity';
import { IdpModule } from '../idp/idp.module';
import { createOperationTimeoutMiddleware } from '../common/middleware/operation-timeout.middleware';
import { CommonModule } from '../common/common.module';
import { ConnectorSecretService } from './services/connector-secret.service';
import { DataMartRunService } from './services/data-mart-run.service';
import { SqlDryRunTrigger } from './entities/sql-dry-run-trigger.entity';
import { SqlDryRunTriggerService } from './services/sql-dry-run-trigger.service';
import { SqlDryRunTriggerHandlerService } from './services/sql-dry-run-trigger-handler.service';
import { SqlDryRunTriggerController } from './controllers/sql-dry-run-trigger.controller';
import { SchemaActualizeTrigger } from './entities/schema-actualize-trigger.entity';
import { SchemaActualizeTriggerService } from './services/schema-actualize-trigger.service';
import { SchemaActualizeTriggerHandlerService } from './services/schema-actualize-trigger-handler.service';
import { SchemaActualizeTriggerController } from './controllers/schema-actualize-trigger.controller';
import { PublishDraftsTrigger } from './entities/publish-drafts-trigger.entity';
import { PublishDraftsTriggerService } from './services/publish-drafts-trigger.service';
import { PublishDraftsTriggerHandlerService } from './services/publish-drafts-trigger-handler.service';
import { PublishDraftsTriggerController } from './controllers/publish-drafts-trigger.controller';
import { ReportRunService } from './services/report-run.service';
import { LookerStudioReportRunService } from './services/looker-studio-report-run.service';
import { InsightMapper } from './mappers/insight.mapper';
import { InsightArtifactMapper } from './mappers/insight-artifact.mapper';
import { InsightTemplateMapper } from './mappers/insight-template.mapper';
import { AiAssistantMapper } from './mappers/ai-assistant.mapper';
import { AiAssistantApplyActionMapper } from './mappers/ai-assistant-apply-action.mapper';
import { AgentFlowRequestMapper } from './mappers/agent-flow-request.mapper';
import { CreateInsightService } from './use-cases/create-insight.service';
import { CreateInsightWithAiService } from './use-cases/create-insight-with-ai.service';
import { GetInsightService } from './use-cases/get-insight.service';
import { ListInsightsService } from './use-cases/list-insights.service';
import { UpdateInsightService } from './use-cases/update-insight.service';
import { UpdateInsightTitleService } from './use-cases/update-insight-title.service';
import { DeleteInsightService } from './use-cases/delete-insight.service';
import { CreateInsightArtifactService } from './use-cases/create-insight-artifact.service';
import { GetInsightArtifactService } from './use-cases/get-insight-artifact.service';
import { ListInsightArtifactsService } from './use-cases/list-insight-artifacts.service';
import { RunInsightArtifactSqlPreviewService } from './use-cases/run-insight-artifact-sql-preview.service';
import { UpdateInsightArtifactService } from './use-cases/update-insight-artifact.service';
import { UpdateInsightArtifactTitleService } from './use-cases/update-insight-artifact-title.service';
import { DeleteInsightArtifactService } from './use-cases/delete-insight-artifact.service';
import { CreateInsightTemplateService } from './use-cases/create-insight-template.service';
import { GetInsightTemplateService } from './use-cases/get-insight-template.service';
import { ListInsightTemplatesService } from './use-cases/list-insight-templates.service';
import { UpdateInsightTemplateService } from './use-cases/update-insight-template.service';
import { UpdateInsightTemplateTitleService } from './use-cases/update-insight-template-title.service';
import { DeleteInsightTemplateService } from './use-cases/delete-insight-template.service';
import { RetryInterruptedConnectorRunsProcessor } from './system-triggers/processors/retry-interrupted-connector-runs-processor';
import { SqlRunService } from './use-cases/sql-run.service';
import { CreateViewService } from './use-cases/create-view.service';
import { aiInsightsProviders } from './ai-insights/ai-insights-providers';
import { InsightExecutionService } from './services/insight-execution.service';
import { RunInsightService } from './use-cases/run-insight.service';
import { RunInsightTemplateService } from './use-cases/run-insight-template.service';
import { GetDataMartRunService } from './use-cases/get-data-mart-run.service';
import { ListDataMartRunsService } from './use-cases/list-data-mart-runs.service';
import { InsightRunTrigger } from './entities/insight-run-trigger.entity';
import { InsightTemplateRunTrigger } from './entities/insight-template-run-trigger.entity';
import { InsightRunTriggerController } from './controllers/insight-run-trigger.controller';
import { InsightTemplateRunTriggerController } from './controllers/insight-template-run-trigger.controller';
import { InsightRunTriggerService } from './services/insight-run-trigger.service';
import { InsightRunTriggerHandlerService } from './services/insight-run-trigger-handler.service';
import { InsightTemplateRunTriggerService } from './services/insight-template-run-trigger.service';
import { InsightTemplateRunTriggerHandlerService } from './services/insight-template-run-trigger-handler.service';
import { InsightTemplateExecutionService } from './services/insight-template-execution.service';
import { ConnectorSourceCredentials } from './entities/connector-source-credentials.entity';
import { ConnectorSourceCredentialsService } from './services/connector-source-credentials.service';
import { ConnectorOauthService } from './services/connector/connector-oauth.service';
import { DataMartTableReferenceService } from './services/data-mart-table-reference.service';
import { InsightTemplateSourceDataService } from './services/insight-template-source-data.service';
import { InsightTemplateSourceService } from './services/insight-template-source.service';
import { DataMartSqlTableService } from './services/data-mart-sql-table.service';
import { DataMartTemplateFacadeImpl } from './template/data-mart-template.facade.impl';
import { AiAssistantSessionService } from './services/ai-assistant-session.service';
import { AiAssistantContextService } from './services/ai-assistant-context.service';
import { AiSourceApplyService } from './services/ai-source-apply.service';
import { AiSourceApplyExecutionService } from './services/ai-source-apply-execution.service';
import { AiAssistantRunTriggerService } from './services/ai-assistant-run-trigger.service';
import { CreateAiAssistantSessionService } from './use-cases/create-ai-assistant-session.service';
import { GetAiAssistantSessionService } from './use-cases/get-ai-assistant-session.service';
import { ListAiAssistantSessionsService } from './use-cases/list-ai-assistant-sessions.service';
import { UpdateAiAssistantSessionTitleService } from './use-cases/update-ai-assistant-session-title.service';
import { DeleteAiAssistantSessionService } from './use-cases/delete-ai-assistant-session.service';
import { CreateAiAssistantMessageService } from './use-cases/create-ai-assistant-message.service';
import { ApplyAiAssistantSessionService } from './use-cases/apply-ai-assistant-session.service';

import { SourceResolverToolsService } from './ai-insights/agent-flow/source-resolver-tools.service';
import { BaseSqlHandleResolverService } from './ai-insights/agent-flow/base-sql-handle-resolver.service';
import { AiAssistantOrchestratorService } from './ai-insights/agent-flow/ai-assistant-orchestrator.service';
import { AiAssistantRunTriggerHandlerService } from './services/ai-assistant-run-trigger-handler.service';
import { RunAiAssistantService } from './use-cases/run-ai-assistant.service';
import { InsightArtifactRepository } from './repositories/insight-artifact.repository';
import { AgentFlowService } from './ai-insights/agent-flow/agent-flow.service';
import { AgentFlowAgent } from './ai-insights/agent-flow/agent-flow.agent';
import { AgentFlowPolicySanitizerService } from './ai-insights/agent-flow/agent-flow-policy-sanitizer.service';
import { AgentFlowToolsRegistrar } from './ai-insights/agent-flow/agent-flow-tools.registrar';
import { AgentFlowContextManager } from './services/agent-flow-context-manager.service';
import { AgentFlowPromptBuilder } from './services/agent-flow-prompt-builder.service';
import { AgentFlowHistorySnapshotAgent } from './services/agent-flow-history-snapshot-agent.service';
import { ListTemplateSourcesTool } from './ai-insights/agent-flow/tools/list-template-sources.tool';
import { ListArtifactsTool } from './ai-insights/agent-flow/tools/list-artifacts.tool';
import { GetTemplateContentTool } from './ai-insights/agent-flow/tools/get-template-content.tool';
import { ProposeRemoveSourceTool } from './ai-insights/agent-flow/tools/propose-remove-source.tool';
import { GenerateSqlTool } from './ai-insights/agent-flow/tools/generate-sql.tool';
import { TemplateTagsService } from './services/template-tags/template-tags.service';
import { TableTagHandler } from '../common/template/handlers/base/table-tag.handler';
import { ValueTagHandler } from '../common/template/handlers/base/value-tag.handler';
import { ListAvailableTagsTool } from './ai-insights/agent-flow/tools/list-available-tags.tool';
import { DataMartSampleDataService } from './services/data-mart-sample-data.service';
import { LegacyDataStorageService } from './services/legacy-data-marts/legacy-data-storage.service';
import { LegacySyncTriggersService } from './services/legacy-data-marts/legacy-sync-triggers.service';
import { SyncLegacyDataMartService } from './use-cases/legacy-data-marts/sync-legacy-data-mart.service';
import { SyncLegacyDataMartsByGcpService } from './use-cases/legacy-data-marts/sync-legacy-data-marts-by-gcp.service';
import { LegacyDataMartsSyncController } from './controllers/internal/legacy-data-marts-sync.controller';
import { ValidateDataStorageAccessService } from './use-cases/validate-data-storage-access.service';
import { BatchDataMartHealthStatusService } from './use-cases/batch-data-mart-health-status.service';
import { GetStorageOAuthStatusService } from './use-cases/google-oauth/get-storage-oauth-status.service';
import { GenerateStorageOAuthUrlService } from './use-cases/google-oauth/generate-storage-oauth-url.service';
import { RevokeStorageOAuthService } from './use-cases/google-oauth/revoke-storage-oauth.service';
import { ExchangeOAuthCodeService } from './use-cases/google-oauth/exchange-oauth-code.service';
import { GetDestinationOAuthStatusService } from './use-cases/google-oauth/get-destination-oauth-status.service';
import { GetDestinationOAuthCredentialStatusService } from './use-cases/google-oauth/get-destination-oauth-credential-status.service';
import { GenerateDestinationOAuthUrlService } from './use-cases/google-oauth/generate-destination-oauth-url.service';
import { RevokeDestinationOAuthService } from './use-cases/google-oauth/revoke-destination-oauth.service';
import { DataStorageCredentialsResolver } from './data-storage-types/data-storage-credentials-resolver.service';
import { DataDestinationCredentialsResolver } from './data-destination-types/data-destination-credentials-resolver.service';
import { DataStorageCredential } from './entities/data-storage-credential.entity';
import { DataDestinationCredential } from './entities/data-destination-credential.entity';
import { DataStorageCredentialService } from './services/data-storage-credential.service';
import { DataDestinationCredentialService } from './services/data-destination-credential.service';
import { GoogleOAuthFlowService } from './services/google-oauth/google-oauth-flow.service';
import { GoogleOAuthClientService } from './services/google-oauth/google-oauth-client.service';
import { GoogleOAuthConfigService } from './services/google-oauth/google-oauth-config.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DataMart,
      DataStorage,
      DataDestination,
      Report,
      Insight,
      InsightArtifact,
      InsightArtifactSqlPreviewTrigger,
      InsightTemplate,
      InsightTemplateSourceEntity,
      DataMartRun,
      DataMartScheduledTrigger,
      ConnectorState,
      ReportDataCache,
      SqlDryRunTrigger,
      SchemaActualizeTrigger,
      PublishDraftsTrigger,
      InsightRunTrigger,
      InsightTemplateRunTrigger,
      ConnectorSourceCredentials,
      DataStorageCredential,
      DataDestinationCredential,
      SyncDataMartsByGcpTrigger,
      SyncGcpStoragesForProjectTrigger,
      AiAssistantSession,
      AiAssistantMessage,
      AiAssistantContext,
      AiAssistantRunTrigger,
      AiAssistantApplyAction,
    ]),
    CommonModule,
    IdpModule,
  ],
  controllers: [
    DataMartController,
    DataStorageController,
    DataDestinationController,
    ReportController,
    InsightController,
    AiAssistantController,
    AiAssistantRunTriggerController,
    InsightArtifactController,
    InsightArtifactSqlPreviewTriggerController,
    InsightTemplateController,
    ConnectorController,
    ScheduledTriggerController,
    LookerStudioConnectorController,
    SqlDryRunTriggerController,
    SchemaActualizeTriggerController,
    PublishDraftsTriggerController,
    InsightRunTriggerController,
    InsightTemplateRunTriggerController,
    MarkdownParserController,
    LegacyDataMartsSyncController,
  ],
  providers: [
    ...dataStorageResolverProviders,
    ...dataStorageFacadesProviders,
    ...dataDestinationResolverProviders,
    ...dataDestinationFacadesProviders,
    ...scheduledTriggerProviders,
    ...scheduledTriggerFacadesProviders,
    ...aiInsightsProviders,
    DataMartService,
    CreateDataMartService,
    ListDataMartsService,
    ListDataMartsByConnectorNameService,
    GetDataMartService,
    ListDataMartRunsService,
    UpdateDataMartDefinitionService,
    PublishDataMartService,
    UpdateDataMartDescriptionService,
    UpdateDataMartTitleService,
    DataMartMapper,
    DataStorageService,
    DataStorageMapper,
    DataDestinationService,
    ValidateDataMartDefinitionService,
    DataMartSchemaParserFacade,
    DataDestinationMapper,
    ListDataStoragesService,
    ListDataDestinationsService,
    DeleteDataStorageService,
    PublishDataStorageDraftsService,
    DeleteDataDestinationService,
    RotateSecretKeyService,
    DataDestinationSecretKeyRotatorFacade,
    DeleteDataMartService,
    GetDataStorageService,
    GetDataDestinationService,
    CreateDataStorageService,
    CreateDataDestinationService,
    UpdateDataStorageService,
    UpdateDataDestinationService,
    ReportMapper,
    CreateReportService,
    GetReportService,
    ListReportsByDataMartService,
    ListReportsByProjectService,
    DeleteReportService,
    RunReportService,
    UpdateReportService,
    InsightMapper,
    InsightArtifactMapper,
    InsightTemplateMapper,
    AiAssistantMapper,
    AiAssistantApplyActionMapper,
    AgentFlowRequestMapper,
    InsightService,
    InsightArtifactRepository,
    InsightArtifactService,
    InsightArtifactSqlPreviewTriggerService,
    InsightArtifactSqlPreviewTriggerHandlerService,
    InsightTemplateService,
    InsightTemplateSourceService,
    InsightTemplateValidationService,
    TemplatePlaceholderValidator,
    TemplateTagContractValidator,
    TemplateTagRenderer,
    TemplateTemplateAssembler,
    TemplateFinalValidator,
    TemplatePlaceholderTagsRendererService,
    TemplateFullReplaceApplyService,
    CreateInsightService,
    CreateInsightWithAiService,
    GetInsightService,
    ListInsightsService,
    UpdateInsightService,
    UpdateInsightTitleService,
    DeleteInsightService,
    CreateInsightArtifactService,
    GetInsightArtifactService,
    ListInsightArtifactsService,
    RunInsightArtifactSqlPreviewService,
    UpdateInsightArtifactService,
    UpdateInsightArtifactTitleService,
    DeleteInsightArtifactService,
    CreateInsightTemplateService,
    GetInsightTemplateService,
    ListInsightTemplatesService,
    UpdateInsightTemplateService,
    UpdateInsightTemplateTitleService,
    DeleteInsightTemplateService,
    InsightExecutionService,
    RunInsightService,
    InsightTemplateExecutionService,
    RunInsightTemplateService,
    DataMartTemplateFacadeImpl,
    InsightTemplateSourceDataService,
    DataMartTableReferenceService,
    DataMartSqlTableService,
    DataMartSampleDataService,
    GetDataMartRunService,
    AvailableConnectorService,
    ConnectorService,
    ConnectorExecutionService,
    ConnectorMapper,
    SpecificationConnectorService,
    FieldsConnectorService,
    RunDataMartService,
    CancelDataMartRunService,
    SqlDryRunService,
    SqlRunService,
    CreateViewService,
    ActualizeDataMartSchemaService,
    UpdateDataMartSchemaService,
    ScheduledTriggersHandlerService,
    SqlDryRunTriggerService,
    SqlDryRunTriggerHandlerService,
    SchemaActualizeTriggerService,
    SchemaActualizeTriggerHandlerService,
    PublishDraftsTriggerService,
    PublishDraftsTriggerHandlerService,
    RetryInterruptedConnectorRunsProcessor,
    ScheduledTriggerService,
    ScheduledTriggerMapper,
    CreateScheduledTriggerService,
    GetScheduledTriggerService,
    ListScheduledTriggersService,
    UpdateScheduledTriggerService,
    DeleteScheduledTriggerService,
    ReportService,
    ReportDataCacheService,
    ConnectorOutputCaptureService,
    ConnectorMessageParserService,
    ConnectorStateService,
    ConsumptionTrackingService,
    ProjectBalanceService,
    LegacyDataMartsService,
    LegacyDataStorageService,
    LegacySyncTriggersService,
    ConnectorSecretService,
    DataMartRunService,
    ReportRunService,
    LookerStudioReportRunService,
    InsightRunTriggerService,
    InsightRunTriggerHandlerService,
    InsightTemplateRunTriggerService,
    InsightTemplateRunTriggerHandlerService,
    ConnectorSourceCredentialsService,
    AiAssistantSessionService,
    AiAssistantContextService,
    AiSourceApplyService,
    AiSourceApplyExecutionService,
    AiAssistantRunTriggerService,
    AiAssistantRunTriggerHandlerService,
    CreateAiAssistantSessionService,
    ListAiAssistantSessionsService,
    GetAiAssistantSessionService,
    UpdateAiAssistantSessionTitleService,
    DeleteAiAssistantSessionService,
    CreateAiAssistantMessageService,
    ApplyAiAssistantSessionService,
    RunAiAssistantService,

    SourceResolverToolsService,
    BaseSqlHandleResolverService,
    AiAssistantOrchestratorService,
    ConnectorOauthService,
    UserProjectionsFetcherService,
    DeleteLegacyDataMartService,
    SyncLegacyDataMartService,
    SyncLegacyDataMartsByGcpService,
    SyncLegacyGcpStoragesForProjectService,
    SyncDataMartsByGcpTriggerHandler,
    SyncGcpStoragesForProjectTriggerHandler,
    ValidateDataStorageAccessService,
    BatchDataMartHealthStatusService,
    AgentFlowService,
    AgentFlowAgent,
    AgentFlowPolicySanitizerService,
    AgentFlowToolsRegistrar,
    AgentFlowContextManager,
    AgentFlowPromptBuilder,
    AgentFlowHistorySnapshotAgent,
    ListTemplateSourcesTool,
    ListArtifactsTool,
    GetTemplateContentTool,
    ProposeRemoveSourceTool,
    GenerateSqlTool,
    GenerateSqlTool,
    TemplateTagsService,
    TableTagHandler,
    ValueTagHandler,
    ListAvailableTagsTool,
    DataStorageCredentialsResolver,
    DataDestinationCredentialsResolver,
    DataStorageCredentialService,
    DataDestinationCredentialService,
    GoogleOAuthFlowService,
    GoogleOAuthClientService,
    GoogleOAuthConfigService,
    GetStorageOAuthStatusService,
    GenerateStorageOAuthUrlService,
    RevokeStorageOAuthService,
    ExchangeOAuthCodeService,
    GetDestinationOAuthStatusService,
    GetDestinationOAuthCredentialStatusService,
    GenerateDestinationOAuthUrlService,
    RevokeDestinationOAuthService,
  ],
})
export class DataMartsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(createOperationTimeoutMiddleware(180000))
      .forRoutes(
        { path: 'data-marts/:id/definition', method: RequestMethod.PUT },
        { path: 'data-marts/:id/publish', method: RequestMethod.PUT }
      );
    consumer
      .apply(createOperationTimeoutMiddleware(30000))
      .exclude(
        { path: 'data-marts/:id/definition', method: RequestMethod.PUT },
        { path: 'data-marts/:id/publish', method: RequestMethod.PUT },
        { path: 'external/*', method: RequestMethod.ALL }
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
