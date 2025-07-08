import { Injectable } from '@nestjs/common';
import { ListScheduledTriggersCommand } from '../dto/domain/list-scheduled-triggers.command';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';

@Injectable()
export class ListScheduledTriggersService {
  constructor(
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly mapper: ScheduledTriggerMapper
  ) {}

  async run(command: ListScheduledTriggersCommand): Promise<ScheduledTriggerDto[]> {
    const triggers = await this.scheduledTriggerService.getAllByDataMartIdAndProjectId(
      command.dataMartId,
      command.projectId
    );
    return this.mapper.toDomainDtoList(triggers);
  }
}
