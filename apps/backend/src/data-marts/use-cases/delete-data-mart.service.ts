import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMart } from '../entities/data-mart.entity';
import { DeleteDataMartCommand } from '../dto/domain/delete-data-mart.command';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { ReportService } from '../services/report.service';

@Injectable()
export class DeleteDataMartService {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepo: Repository<DataMart>,
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
    await this.dataMartRepo.softDelete({
      id: command.id,
      projectId: command.projectId,
    });
  }
}
