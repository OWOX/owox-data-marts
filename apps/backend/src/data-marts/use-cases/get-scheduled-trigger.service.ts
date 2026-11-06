import { ForbiddenException, Injectable } from '@nestjs/common';
import { GetScheduledTriggerCommand } from '../dto/domain/get-scheduled-trigger.command';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { DataMartService } from '../services/data-mart.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';

@Injectable()
export class GetScheduledTriggerService {
  constructor(
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly mapper: ScheduledTriggerMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetScheduledTriggerCommand): Promise<ScheduledTriggerDto> {
    if (
      !command.userId ||
      !(await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.dataMartId,
        Action.SEE,
        command.projectId
      ))
    )
      throw new ForbiddenException('You do not have access to this DataMart');

    await this.dataMartService.getByIdAndProjectId(command.dataMartId, command.projectId);

    const trigger = await this.scheduledTriggerService.getByIdAndDataMartIdAndProjectId(
      command.id,
      command.dataMartId,
      command.projectId
    );

    const createdByUser = await this.userProjectionsFetcherService.fetchCreatedByUser(trigger);

    return this.mapper.toDomainDto(trigger, createdByUser);
  }
}
