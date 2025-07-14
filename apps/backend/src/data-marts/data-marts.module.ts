import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { DataMartController } from './controllers/data-mart.controller';
import { DataStorageController } from './controllers/data-storage.controller';
import { DataDestinationController } from './controllers/data-destination.controller';
import { ReportController } from './controllers/report.controller';
import { ScheduledTriggerController } from './controllers/scheduled-trigger.controller';
import { CreateDataMartService } from './use-cases/create-data-mart.service';
import { ListDataMartsService } from './use-cases/list-data-marts.service';
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
import { dataStorageFacadesProviders } from './data-storage-types/data-storage-facades';
import { dataStorageResolverProviders } from './data-storage-types/data-storage-providers';
import { dataDestinationFacadesProviders } from './data-destination-types/data-destination-facades';
import { dataDestinationResolverProviders } from './data-destination-types/data-destination-providers';
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
import { ValidateDataMartDefinitionService } from './use-cases/validate-data-mart-definition.service';
import { ActualizeDataMartSchemaService } from './use-cases/actualize-data-mart-schema.service';
import { UpdateDataMartSchemaService } from './use-cases/update-data-mart-schema.service';
import { SqlDryRunService } from './use-cases/sql-dry-run.service';
import { DataMartSchemaParserFacade } from './data-storage-types/facades/data-mart-schema-parser-facade.service';
import { DataMartScheduledTrigger } from './entities/data-mart-scheduled-trigger.entity';
import { SchedulerModule } from '../common/scheduler/scheduler.module';
import { ScheduledTriggersHandlerService } from './services/scheduled-triggers-handler.service';
import { ReportService } from './services/report.service';
import { ConnectorOutputCaptureService } from './connector-types/connector-message/services/connector-output-capture.service';
import { ConnectorMessageParserService } from './connector-types/connector-message/services/connector-message-parser.service';
import { ConnectorStateService } from './connector-types/connector-message/services/connector-state.service';
import { ConnectorState } from './entities/connector-state.entity';

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
    ]),
    SchedulerModule,
  ],
  controllers: [
    DataMartController,
    DataStorageController,
    DataDestinationController,
    ReportController,
    ConnectorController,
    ScheduledTriggerController,
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
    GetDataMartService,
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
    SqlDryRunService,
    ActualizeDataMartSchemaService,
    UpdateDataMartSchemaService,
    ScheduledTriggersHandlerService,
    ScheduledTriggerService,
    ScheduledTriggerMapper,
    CreateScheduledTriggerService,
    GetScheduledTriggerService,
    ListScheduledTriggersService,
    UpdateScheduledTriggerService,
    DeleteScheduledTriggerService,
    ReportService,
    ConnectorOutputCaptureService,
    ConnectorMessageParserService,
    ConnectorStateService,
  ],
})
export class DataMartsModule {}
