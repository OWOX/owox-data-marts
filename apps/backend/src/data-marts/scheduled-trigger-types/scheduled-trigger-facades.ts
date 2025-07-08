import { ScheduledTriggerProcessorFacade } from './facades/scheduled-trigger-processor.facade';
import { ScheduledTriggerValidatorFacade } from './facades/scheduled-trigger-validator.facade';

export const scheduledTriggerFacadesProviders = [
  ScheduledTriggerProcessorFacade,
  ScheduledTriggerValidatorFacade,
];
