import { DataMartDefinitionValidatorFacade } from './facades/data-mart-definition-validator-facade.service';
import { DataMartSchemaMergerFacade } from './facades/data-mart-schema-merger.facade';
import { DataMartSchemaProviderFacade } from './facades/data-mart-schema-provider.facade';
import { DataStorageAccessFacade } from './facades/data-storage-access.facade';
import { SqlDryRunExecutorFacade } from './facades/sql-dry-run-executor.facade';

export const dataStorageFacadesProviders = [
  DataStorageAccessFacade,
  DataMartDefinitionValidatorFacade,
  DataMartSchemaProviderFacade,
  DataMartSchemaMergerFacade,
  SqlDryRunExecutorFacade,
];
