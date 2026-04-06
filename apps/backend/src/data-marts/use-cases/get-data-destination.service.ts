import { Injectable } from '@nestjs/common';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DataDestinationService } from '../services/data-destination.service';
import { GetDataDestinationCommand } from '../dto/domain/get-data-destination.command';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';

@Injectable()
export class GetDataDestinationService {
  constructor(
    private readonly dataDestinationService: DataDestinationService,
    private readonly dataDestinationMapper: DataDestinationMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async run(command: GetDataDestinationCommand): Promise<DataDestinationDto> {
    const dataDestinationEntity = await this.dataDestinationService.getByIdAndProjectId(
      command.id,
      command.projectId
    );

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
