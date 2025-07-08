import { Inject, Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataMartScheduledTrigger } from '../../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerType } from '../enums/scheduled-trigger-type.enum';
import { ScheduledTriggerValidator } from '../interfaces/scheduled-trigger-config-validator.interface';
import { SCHEDULED_TRIGGER_CONFIG_VALIDATOR_RESOLVER } from '../scheduled-trigger-providers';

@Injectable()
export class ScheduledTriggerValidatorFacade {
  constructor(
    @Inject(SCHEDULED_TRIGGER_CONFIG_VALIDATOR_RESOLVER)
    private readonly resolver: TypeResolver<ScheduledTriggerType, ScheduledTriggerValidator>
  ) {}

  async validate(trigger: DataMartScheduledTrigger): Promise<void> {
    if (!trigger.type) {
      throw new BusinessViolationException('Scheduled trigger type is not specified');
    }

    const validator = await this.resolver.resolve(trigger.type);
    const validationResult = await validator.validate(trigger);
    if (!validationResult.valid) {
      throw new BusinessViolationException(validationResult.errorMessage!, validationResult.reason);
    }
  }
}
