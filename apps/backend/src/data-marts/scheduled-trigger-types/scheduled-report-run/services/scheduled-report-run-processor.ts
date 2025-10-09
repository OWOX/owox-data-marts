import { Injectable, Logger } from '@nestjs/common';
import { RunReportCommand } from '../../../dto/domain/run-report.command';
import { DataMartScheduledTrigger } from '../../../entities/data-mart-scheduled-trigger.entity';
import { RunReportService } from '../../../use-cases/run-report.service';
import { ScheduledTriggerType } from '../../enums/scheduled-trigger-type.enum';
import { ScheduledTriggerProcessor } from '../../interfaces/scheduled-trigger-processor.interface';
import { isScheduledReportRunConfig } from '../../scheduled-trigger-config.guards';

@Injectable()
export class ScheduledReportRunProcessor implements ScheduledTriggerProcessor {
  private readonly logger = new Logger(ScheduledReportRunProcessor.name);
  readonly type = ScheduledTriggerType.REPORT_RUN;

  constructor(private readonly runReportService: RunReportService) {}

  async process(trigger: DataMartScheduledTrigger, signal: AbortSignal): Promise<void> {
    this.logger.log(`Processing trigger ${trigger.id}`);

    if (trigger.type !== this.type) {
      throw new Error(`Incompatible trigger type ${trigger.type}`);
    }

    if (!trigger.triggerConfig || !isScheduledReportRunConfig(trigger.triggerConfig)) {
      throw new Error(`Invalid trigger config`);
    }

    const runReportCommand = {
      reportId: trigger.triggerConfig.reportId,
      userId: trigger.createdById,
    } as RunReportCommand;

    await this.runReportService.run(runReportCommand, signal);
    this.logger.log(`Trigger ${trigger.id} processed`);
  }
}
