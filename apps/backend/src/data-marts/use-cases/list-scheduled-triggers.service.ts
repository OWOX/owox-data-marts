import { ForbiddenException, Injectable } from '@nestjs/common';
import { ListScheduledTriggersCommand } from '../dto/domain/list-scheduled-triggers.command';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { DataMartService } from '../services/data-mart.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';

@Injectable()
export class ListScheduledTriggersService {
  constructor(
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly mapper: ScheduledTriggerMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: ListScheduledTriggersCommand): Promise<ScheduledTriggerDto[]> {
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

    const triggers = await this.scheduledTriggerService.getAllByDataMartIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(triggers);

    return this.mapper.toDomainDtoList(triggers, userProjectionsList);
  }
}
