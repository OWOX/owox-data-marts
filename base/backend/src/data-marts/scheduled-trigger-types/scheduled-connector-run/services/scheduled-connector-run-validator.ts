import { Injectable, Logger } from '@nestjs/common';
import { isConnectorDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataMartScheduledTrigger } from '../../../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerType } from '../../enums/scheduled-trigger-type.enum';
import {
  ScheduledTriggerValidator,
  ValidationResult,
} from '../../interfaces/scheduled-trigger-config-validator.interface';

@Injectable()
export class ScheduledConnectorRunValidator implements ScheduledTriggerValidator {
  private readonly logger = new Logger(ScheduledConnectorRunValidator.name);
  readonly type = ScheduledTriggerType.CONNECTOR_RUN;

  async validate(trigger: DataMartScheduledTrigger): Promise<ValidationResult> {
    this.logger.debug(`Validating trigger ${trigger}`);

    if (!isConnectorDefinition(trigger.dataMart.definition!)) {
      return new ValidationResult(
        false,
        'Scheduled connector run requires data mart with connector definition'
      );
    }

    if (trigger.triggerConfig) {
      return new ValidationResult(false, 'Trigger config is not allowed for connector run');
    }

    return new ValidationResult(true);
  }
}
