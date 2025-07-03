import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataMartScheduledTrigger } from '../../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerType } from '../enums/scheduled-trigger-type.enum';

/**
 * Interface for scheduled trigger processors
 */
export interface ScheduledTriggerProcessor extends TypedComponent<ScheduledTriggerType> {
  /**
   * Processes a scheduled trigger
   * @param trigger The trigger to process
   */
  process(trigger: DataMartScheduledTrigger): Promise<void>;
}
