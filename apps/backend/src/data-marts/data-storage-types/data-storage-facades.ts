import { DataStorageAccessFacade } from './facades/data-storage-access.facade';
import { DataMartDefinitionValidatorFacade } from './facades/data-mart-definition-validator-facade.service';

export const dataStorageFacadesProviders = [
  DataStorageAccessFacade,
  DataMartDefinitionValidatorFacade,
];
