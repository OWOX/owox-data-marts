import { DataMartDefinitionValidatorFacade } from './facades/data-mart-definition-validator-facade.service';
import { DataMartSchemaMergerFacade } from './facades/data-mart-schema-merger.facade';
import { DataMartSchemaProviderFacade } from './facades/data-mart-schema-provider.facade';
import { DataStorageAccessFacade } from './facades/data-storage-access.facade';
import { ReportHeadersGeneratorFacade } from './facades/report-headers-generator.facade';
import { SqlDryRunExecutorFacade } from './facades/sql-dry-run-executor.facade';
import { SqlRunExecutorFacade } from './facades/sql-run-executor.facade';
import { CreateViewExecutorFacade } from './facades/create-view-executor.facade';

export const dataStorageFacadesProviders = [
  DataStorageAccessFacade,
  DataMartDefinitionValidatorFacade,
  DataMartSchemaProviderFacade,
  DataMartSchemaMergerFacade,
  ReportHeadersGeneratorFacade,
  SqlDryRunExecutorFacade,
  SqlRunExecutorFacade,
  CreateViewExecutorFacade,
];
