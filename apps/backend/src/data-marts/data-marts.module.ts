import { TypeOrmModule } from '@nestjs/typeorm';
import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { DataMartController } from './controllers/data-mart.controller';
import { DataStorageController } from './controllers/data-storage.controller';
import { DataDestinationController } from './controllers/data-destination.controller';
import { LookerStudioConnectorController } from './controllers/external/looker-studio-connector.controller';
import { ReportController } from './controllers/report.controller';
import { ScheduledTriggerController } from './controllers/scheduled-trigger.controller';
import { ConsumptionTrackingService } from './services/consumption-tracking.service';
import { ReportDataCacheService } from './services/report-data-cache.service';
import { CreateDataMartService } from './use-cases/create-data-mart.service';
import { ListDataMartsService } from './use-cases/list-data-marts.service';
import { ListDataMartsByConnectorNameService } from './use-cases/list-data-marts-by-connector-name.service';
import { GetDataMartService } from './use-cases/get-data-mart.service';
import { GetDataMartRunsService } from './use-cases/get-data-mart-runs.service';
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
import { RotateSecretKeyService } from './use-cases/rotate-secret-key.service';
import { DeleteDataMartService } from './use-cases/delete-data-mart.service';
import { DataDestination } from './entities/data-destination.entity';
import { Report } from './entities/report.entity';
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
import { SystemTrigger } from '../common/scheduler/shared/entities/system-trigger.entity';
import { RetryInterruptedConnectorRunsProcessor } from './system-triggers/processors/retry-interrupted-connector-runs-processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DataMart,
      DataStorage,
      DataDestination,
      Report,
      DataMartRun,
      DataMartScheduledTrigger,
      ConnectorState,
      ReportDataCache,
      SqlDryRunTrigger,
      SchemaActualizeTrigger,
      SystemTrigger,
    ]),
    CommonModule,
    IdpModule,
  ],
  controllers: [
    DataMartController,
    DataStorageController,
    DataDestinationController,
    ReportController,
    ConnectorController,
    ScheduledTriggerController,
    LookerStudioConnectorController,
    SqlDryRunTriggerController,
    SchemaActualizeTriggerController,
  ],
  providers: [
    ...dataStorageResolverProviders,
    ...dataStorageFacadesProviders,
    ...dataDestinationResolverProviders,
    ...dataDestinationFacadesProviders,
    ...scheduledTriggerProviders,
    ...scheduledTriggerFacadesProviders,
    DataMartService,
    CreateDataMartService,
    ListDataMartsService,
    ListDataMartsByConnectorNameService,
    GetDataMartService,
    GetDataMartRunsService,
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
    AvailableConnectorService,
    ConnectorService,
    ConnectorExecutionService,
    ConnectorMapper,
    SpecificationConnectorService,
    FieldsConnectorService,
    RunDataMartService,
    CancelDataMartRunService,
    SqlDryRunService,
    ActualizeDataMartSchemaService,
    UpdateDataMartSchemaService,
    ScheduledTriggersHandlerService,
    SqlDryRunTriggerService,
    SqlDryRunTriggerHandlerService,
    SchemaActualizeTriggerService,
    SchemaActualizeTriggerHandlerService,
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
    ConnectorSecretService,
    DataMartRunService,
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
        { path: 'data-marts/:id/publish', method: RequestMethod.PUT }
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
