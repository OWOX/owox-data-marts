import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMart } from '../entities/data-mart.entity';
import { DeleteDataMartCommand } from '../dto/domain/delete-data-mart.command';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';

@Injectable()
export class DeleteDataMartService {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepo: Repository<DataMart>,
    private readonly scheduledTriggerService: ScheduledTriggerService
  ) {}

  async run(command: DeleteDataMartCommand): Promise<void> {
    // Soft delete the data mart
    await this.dataMartRepo.softDelete({
      id: command.id,
      projectId: command.projectId,
      createdById: command.userId,
    });

    // Delete all triggers related to this data mart
    await this.scheduledTriggerService.deleteAllByDataMartIdAndProjectId(
      command.id,
      command.projectId
    );
  }
}
