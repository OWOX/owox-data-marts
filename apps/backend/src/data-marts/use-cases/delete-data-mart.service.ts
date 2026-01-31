import { Injectable } from '@nestjs/common';
import { DeleteDataMartCommand } from '../dto/domain/delete-data-mart.command';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { ReportService } from '../services/report.service';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class DeleteDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly reportService: ReportService
  ) {}

  async run(command: DeleteDataMartCommand): Promise<void> {
    // Delete all reports related to this data mart
    await this.reportService.deleteAllByDataMartIdAndProjectId(command.id, command.projectId);

    // Delete all triggers related to this data mart
    await this.scheduledTriggerService.deleteAllByDataMartIdAndProjectId(
      command.id,
      command.projectId
    );

    // Soft delete the data mart
    await this.dataMartService.softDeleteByIdAndProjectId(command.id, command.projectId);
  }
}
