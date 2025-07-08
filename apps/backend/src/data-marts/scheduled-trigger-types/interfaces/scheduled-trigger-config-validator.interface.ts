import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataMartScheduledTrigger } from '../../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerType } from '../enums/scheduled-trigger-type.enum';

/**
 * Interface for scheduled trigger validators
 */
export interface ScheduledTriggerValidator extends TypedComponent<ScheduledTriggerType> {
  /**
   * Validates a scheduled trigger
   * @param trigger The trigger to validate
   * @returns Validation result
   */
  validate(trigger: DataMartScheduledTrigger): Promise<ValidationResult>;
}

// TODO: create unified implementation for all 4 ValidationResult implementations.
export class ValidationResult {
  constructor(
    public readonly valid: boolean,
    public readonly errorMessage?: string,
    public readonly reason?: Record<string, unknown>
  ) {}
}
