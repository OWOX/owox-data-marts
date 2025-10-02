import { DataDestinationAccessValidatorFacade } from './facades/data-destination-access-validator.facade';
import { DataDestinationCredentialsProcessorFacade } from './facades/data-destination-credentials-processor.facade';
import { DataDestinationCredentialsValidatorFacade } from './facades/data-destination-credentials-validator.facade';
import { DataDestinationSecretKeyRotatorFacade } from './facades/data-destination-secret-key-rotator.facade';

export const dataDestinationFacadesProviders = [
  DataDestinationAccessValidatorFacade,
  DataDestinationCredentialsValidatorFacade,
  DataDestinationCredentialsProcessorFacade,
  DataDestinationSecretKeyRotatorFacade,
];
