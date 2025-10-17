import { Injectable, Logger } from '@nestjs/common';
import { DataMartScheduledTrigger } from '../../../entities/data-mart-scheduled-trigger.entity';
import { RunDataMartService } from '../../../use-cases/run-data-mart.service';
import { ScheduledTriggerType } from '../../enums/scheduled-trigger-type.enum';
import { ScheduledTriggerProcessor } from '../../interfaces/scheduled-trigger-processor.interface';
import { RunDataMartCommand } from '../../../dto/domain/run-data-mart.command';
import { RunType } from '../../../../common/scheduler/shared/types';

@Injectable()
export class ScheduledConnectorRunProcessor implements ScheduledTriggerProcessor {
  private readonly logger = new Logger(ScheduledConnectorRunProcessor.name);
  readonly type = ScheduledTriggerType.CONNECTOR_RUN;

  constructor(private readonly runDataMartService: RunDataMartService) {}

  async process(trigger: DataMartScheduledTrigger): Promise<void> {
    this.logger.log(`Processing trigger ${trigger.id}`);

    if (trigger.type !== this.type) {
      throw new Error(`Incompatible trigger type ${trigger.type}`);
    }

    await this.runDataMartService.run(
      new RunDataMartCommand(
        trigger.dataMart.id,
        trigger.dataMart.projectId,
        trigger.createdById,
        RunType.scheduled,
        undefined
      )
    );
    this.logger.log(`Trigger ${trigger.id} processed`);
  }
}
