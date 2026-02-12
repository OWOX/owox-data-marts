import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DeleteDataMartCommand } from '../dto/domain/delete-data-mart.command';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { ReportService } from '../services/report.service';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class DeleteDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly reportService: ReportService,
    private readonly legacyDataMartsService: LegacyDataMartsService
  ) {}

  async run(command: DeleteDataMartCommand): Promise<void> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (
      !command.disableLegacySync &&
      dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY
    ) {
      await this.legacyDataMartsService.deleteDataMart(dataMart.id);
    }

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
