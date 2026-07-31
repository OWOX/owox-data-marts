import { Injectable, Logger } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../../idp/facades/idp-projections.facade';
import { DataMartScheduledTrigger } from '../../../entities/data-mart-scheduled-trigger.entity';
import { DataQualityRunRequestService } from '../../../services/data-quality-run-request.service';
import { ScheduledTriggerType } from '../../enums/scheduled-trigger-type.enum';
import {
  ScheduledTriggerValidator,
  ValidationResult,
} from '../../interfaces/scheduled-trigger-config-validator.interface';
import { resolveScheduledDataQualityRunContext } from './scheduled-data-quality-run-context';

@Injectable()
export class ScheduledDataQualityRunValidator implements ScheduledTriggerValidator {
  private readonly logger = new Logger(ScheduledDataQualityRunValidator.name);
  readonly type = ScheduledTriggerType.DATA_QUALITY_RUN;

  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly runRequestService: DataQualityRunRequestService
  ) {}

  async validate(trigger: DataMartScheduledTrigger): Promise<ValidationResult> {
    this.logger.debug(`Validating trigger ${trigger.id}`);

    if (trigger.triggerConfig != null) {
      return new ValidationResult(false, 'Trigger config is not allowed for Data Quality run');
    }
    if (!trigger.dataMart.schema) {
      return new ValidationResult(false, 'Scheduled Data Quality run requires an Output Schema');
    }
    if (!trigger.dataMart.definition || !trigger.dataMart.definitionType) {
      return new ValidationResult(
        false,
        'Scheduled Data Quality run requires a Data Mart definition'
      );
    }

    const context = await resolveScheduledDataQualityRunContext(this.idpProjectionsFacade, trigger);
    if (!(await this.runRequestService.hasApplicableEnabledChecks(context, trigger.dataMart.id))) {
      return new ValidationResult(
        false,
        'Scheduled Data Quality run requires at least one applicable enabled check'
      );
    }

    return new ValidationResult(true);
  }
}
