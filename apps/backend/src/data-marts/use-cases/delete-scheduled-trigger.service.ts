import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeleteScheduledTriggerCommand } from '../dto/domain/delete-scheduled-trigger.command';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';

@Injectable()
export class DeleteScheduledTriggerService {
  constructor(
    @InjectRepository(DataMartScheduledTrigger)
    private readonly triggerRepository: Repository<DataMartScheduledTrigger>
  ) {}

  async run(command: DeleteScheduledTriggerCommand): Promise<void> {
    await this.triggerRepository.delete({
      id: command.id,
      dataMart: {
        id: command.dataMartId,
        projectId: command.projectId,
      },
    });
  }
}
