import { Injectable, Logger } from '@nestjs/common';
import {
  isPullBasedDataDestinationType,
  toHumanReadable,
} from '../../../data-destination-types/enums/data-destination-type.enum';
import { DataMartScheduledTrigger } from '../../../entities/data-mart-scheduled-trigger.entity';
import { Report } from '../../../entities/report.entity';
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

    let report: Report;
    try {
      report = await this.reportService.getByIdAndDataMartIdAndProjectId(
        configOpt.data.reportId,
        trigger.dataMart.id,
        trigger.dataMart.projectId
      );
    } catch (error) {
      this.logger.warn('Requested report not found', error);
      return new ValidationResult(false, 'Requested report not found and cannot be scheduled');
    }

    // A schedule only makes sense for a report the server can run. On a pull-based destination
    // no one can start a run — see ReportRunService.createPending — so a trigger saved here
    // would fail on every fire instead of ever delivering data. Refused at the one place both
    // creating and re-validating a trigger pass through, rather than only in the UI.
    if (isPullBasedDataDestinationType(report.dataDestination.type)) {
      return new ValidationResult(
        false,
        `Reports on a ${toHumanReadable(report.dataDestination.type)} destination cannot be ` +
          `scheduled — the data is read by the destination itself.`
      );
    }

    return new ValidationResult(true);
  }
}
