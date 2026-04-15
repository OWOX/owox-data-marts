import { Injectable, ForbiddenException } from '@nestjs/common';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DataDestinationService } from '../services/data-destination.service';
import { GetDataDestinationCommand } from '../dto/domain/get-data-destination.command';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class GetDataDestinationService {
  constructor(
    private readonly dataDestinationService: DataDestinationService,
    private readonly dataDestinationMapper: DataDestinationMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetDataDestinationCommand): Promise<DataDestinationDto> {
    const dataDestinationEntity = await this.dataDestinationService.getByIdAndProjectId(
      command.id,
      command.projectId
    );

    if (command.userId) {
      const canSee = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DESTINATION,
        command.id,
        Action.SEE,
        command.projectId
      );
      if (!canSee) {
        throw new ForbiddenException('You do not have access to this Destination');
      }
    }

    const allUserIds = [
      ...(dataDestinationEntity.createdById ? [dataDestinationEntity.createdById] : []),
      ...dataDestinationEntity.ownerIds,
    ];
    const userProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);

    const createdByUser = dataDestinationEntity.createdById
      ? (userProjections.getByUserId(dataDestinationEntity.createdById) ?? null)
      : null;

    return this.dataDestinationMapper.toDomainDto(
      dataDestinationEntity,
      createdByUser,
      resolveOwnerUsers(dataDestinationEntity.ownerIds, userProjections)
    );
  }
}
