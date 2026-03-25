import { Injectable } from '@nestjs/common';
import { GetScheduledTriggerCommand } from '../dto/domain/get-scheduled-trigger.command';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class GetScheduledTriggerService {
  constructor(
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly mapper: ScheduledTriggerMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async run(command: GetScheduledTriggerCommand): Promise<ScheduledTriggerDto> {
    const trigger = await this.scheduledTriggerService.getByIdAndDataMartIdAndProjectId(
      command.id,
      command.dataMartId,
      command.projectId
    );

    const createdByUser = trigger.createdById
      ? ((await this.userProjectionsFetcherService.fetchUserProjection(trigger.createdById)) ??
        null)
      : null;

    return this.mapper.toDomainDto(trigger, createdByUser);
  }
}
