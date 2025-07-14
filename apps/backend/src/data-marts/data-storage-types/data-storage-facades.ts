import { DataMartDefinitionValidatorFacade } from './facades/data-mart-definition-validator-facade.service';
import { DataMartSchemaMergerFacade } from './facades/data-mart-schema-merger.facade';
import { DataMartSchemaProviderFacade } from './facades/data-mart-schema-provider.facade';
import { DataStorageAccessFacade } from './facades/data-storage-access.facade';

export const dataStorageFacadesProviders = [
  DataStorageAccessFacade,
  DataMartDefinitionValidatorFacade,
  DataMartSchemaProviderFacade,
  DataMartSchemaMergerFacade,
];
