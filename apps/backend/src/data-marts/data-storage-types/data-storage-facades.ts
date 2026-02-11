import { DataMartDefinitionValidatorFacade } from './facades/data-mart-definition-validator-facade.service';
import { DataMartQueryBuilderFacade } from './facades/data-mart-query-builder.facade';
import { DataMartSchemaMergerFacade } from './facades/data-mart-schema-merger.facade';
import { DataMartSchemaProviderFacade } from './facades/data-mart-schema-provider.facade';
import { DataStorageAccessValidatorFacade } from './facades/data-storage-access-validator-facade.service';
import { ReportHeadersGeneratorFacade } from './facades/report-headers-generator.facade';
import { SqlDryRunExecutorFacade } from './facades/sql-dry-run-executor.facade';
import { SqlRunExecutorFacade } from './facades/sql-run-executor.facade';
import { CreateViewExecutorFacade } from './facades/create-view-executor.facade';

export const dataStorageFacadesProviders = [
  DataStorageAccessValidatorFacade,
  DataMartDefinitionValidatorFacade,
  DataMartSchemaProviderFacade,
  DataMartSchemaMergerFacade,
  DataMartQueryBuilderFacade,
  ReportHeadersGeneratorFacade,
  SqlDryRunExecutorFacade,
  SqlRunExecutorFacade,
  CreateViewExecutorFacade,
];
