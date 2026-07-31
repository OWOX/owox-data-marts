import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { RunType } from '../../../../common/scheduler/shared/types';
import { IdpProjectionsFacade } from '../../../../idp/facades/idp-projections.facade';
import { DataMartScheduledTrigger } from '../../../entities/data-mart-scheduled-trigger.entity';
import { DataQualityRunRequestService } from '../../../services/data-quality-run-request.service';
import { ScheduledTriggerType } from '../../enums/scheduled-trigger-type.enum';
import type { ScheduledTriggerProcessor } from '../../interfaces/scheduled-trigger-processor.interface';
import { resolveScheduledDataQualityRunContext } from './scheduled-data-quality-run-context';

@Injectable()
export class ScheduledDataQualityRunProcessor implements ScheduledTriggerProcessor {
  private readonly logger = new Logger(ScheduledDataQualityRunProcessor.name);
  readonly type = ScheduledTriggerType.DATA_QUALITY_RUN;

  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly runRequestService: DataQualityRunRequestService
  ) {}

  async process(trigger: DataMartScheduledTrigger): Promise<void> {
    this.logger.log(`Processing trigger ${trigger.id}`);

    if (trigger.type !== this.type) {
      throw new Error(`Incompatible trigger type ${trigger.type}`);
    }
    if (trigger.triggerConfig != null) {
      throw new Error('Trigger config is not allowed for Data Quality run');
    }

    const context = await resolveScheduledDataQualityRunContext(this.idpProjectionsFacade, trigger);

    try {
      await this.runRequestService.enqueue(context, trigger.dataMart.id, RunType.scheduled);
    } catch (error) {
      if (isActiveDataQualityRunConflict(error)) {
        this.logger.log(
          `Skipping trigger ${trigger.id}: a Data Quality run is already active for Data Mart ${trigger.dataMart.id}`
        );
        return;
      }
      throw error;
    }

    this.logger.log(`Trigger ${trigger.id} processed`);
  }
}

function isActiveDataQualityRunConflict(error: unknown): boolean {
  if (!(error instanceof ConflictException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    response.code === 'DATA_QUALITY_RUN_ACTIVE'
  );
}
