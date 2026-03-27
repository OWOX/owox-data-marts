import { Injectable } from '@nestjs/common';
import { ListScheduledTriggersCommand } from '../dto/domain/list-scheduled-triggers.command';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class ListScheduledTriggersService {
  constructor(
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly mapper: ScheduledTriggerMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async run(command: ListScheduledTriggersCommand): Promise<ScheduledTriggerDto[]> {
    const triggers = await this.scheduledTriggerService.getAllByDataMartIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(triggers);

    return this.mapper.toDomainDtoList(triggers, userProjectionsList);
  }
}
