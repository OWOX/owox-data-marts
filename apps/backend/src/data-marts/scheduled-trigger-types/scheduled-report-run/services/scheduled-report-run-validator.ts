import { Injectable, Logger } from '@nestjs/common';
import { DataMartScheduledTrigger } from '../../../entities/data-mart-scheduled-trigger.entity';
import { ReportService } from '../../../services/report.service';
import { ScheduledTriggerType } from '../../enums/scheduled-trigger-type.enum';
import {
  ScheduledTriggerValidator,
  ValidationResult,
} from '../../interfaces/scheduled-trigger-config-validator.interface';
import { ScheduledReportRunConfigSchema } from '../schemas/scheduled-report-run-config.schema';

@Injectable()
export class ScheduledReportRunValidator implements ScheduledTriggerValidator {
  private readonly logger = new Logger(ScheduledReportRunValidator.name);
  readonly type = ScheduledTriggerType.REPORT_RUN;

  constructor(private readonly reportService: ReportService) {}

  async validate(trigger: DataMartScheduledTrigger): Promise<ValidationResult> {
    this.logger.debug(`Validating trigger ${trigger}`);

    if (!trigger.triggerConfig) {
      return new ValidationResult(false, 'Trigger config is required for report run');
    }

    const configOpt = ScheduledReportRunConfigSchema.safeParse(trigger.triggerConfig);
    if (!configOpt.success) {
      this.logger.warn('Invalid trigger config', configOpt.error);
      return new ValidationResult(false, 'Invalid trigger config', {
        errors: configOpt.error.errors,
      });
    }

    try {
      await this.reportService.getByIdAndDataMartIdAndProjectId(
        configOpt.data.reportId,
        trigger.dataMart.id,
        trigger.dataMart.projectId
      );
    } catch (error) {
      this.logger.warn('Requested report not found', error);
      return new ValidationResult(false, 'Requested report not found and cannot be scheduled');
    }

    return new ValidationResult(true);
  }
}
