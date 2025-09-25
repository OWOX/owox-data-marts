import { TypeResolver } from '../../common/resolver/type-resolver';
import { ScheduledTriggerType } from './enums/scheduled-trigger-type.enum';
import { ScheduledTriggerValidator } from './interfaces/scheduled-trigger-config-validator.interface';
import { ScheduledTriggerProcessor } from './interfaces/scheduled-trigger-processor.interface';
import { ScheduledConnectorRunProcessor } from './scheduled-connector-run/services/scheduled-connector-run-processor';
import { ScheduledConnectorRunValidator } from './scheduled-connector-run/services/scheduled-connector-run-validator';
import { ScheduledReportRunProcessor } from './scheduled-report-run/services/scheduled-report-run-processor';
import { ScheduledReportRunValidator } from './scheduled-report-run/services/scheduled-report-run-validator';

export const SCHEDULED_TRIGGER_PROCESSOR_RESOLVER = Symbol('SCHEDULED_TRIGGER_PROCESSOR_RESOLVER');
export const scheduledTriggerProcessorProviders = [
  ScheduledReportRunProcessor,
  ScheduledConnectorRunProcessor,
];

export const SCHEDULED_TRIGGER_CONFIG_VALIDATOR_RESOLVER = Symbol(
  'SCHEDULED_TRIGGER_CONFIG_VALIDATOR_RESOLVER'
);
export const scheduledTriggerConfigValidatorProviders = [
  ScheduledReportRunValidator,
  ScheduledConnectorRunValidator,
];

export const scheduledTriggerProviders = [
  ...scheduledTriggerProcessorProviders,
  ...scheduledTriggerConfigValidatorProviders,
  {
    provide: SCHEDULED_TRIGGER_PROCESSOR_RESOLVER,
    useFactory: (...processors: ScheduledTriggerProcessor[]) =>
      new TypeResolver<ScheduledTriggerType, ScheduledTriggerProcessor>(processors),
    inject: scheduledTriggerProcessorProviders,
  },
  {
    provide: SCHEDULED_TRIGGER_CONFIG_VALIDATOR_RESOLVER,
    useFactory: (...validators: ScheduledTriggerValidator[]) =>
      new TypeResolver<ScheduledTriggerType, ScheduledTriggerValidator>(validators),
    inject: scheduledTriggerConfigValidatorProviders,
  },
];
