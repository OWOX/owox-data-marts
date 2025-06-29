import { DataDestinationAccessValidatorFacade } from './facades/data-destination-access-validator.facade';
import { DataDestinationCredentialsValidatorFacade } from './facades/data-destination-credentials-validator.facade';

export const dataDestinationFacadesProviders = [
  DataDestinationAccessValidatorFacade,
  DataDestinationCredentialsValidatorFacade,
];
