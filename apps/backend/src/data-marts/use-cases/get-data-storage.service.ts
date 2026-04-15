import { Injectable, ForbiddenException } from '@nestjs/common';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataStorageService } from '../services/data-storage.service';
import { GetDataStorageCommand } from '../dto/domain/get-data-storage.command';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class GetDataStorageService {
  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly dataStorageMapper: DataStorageMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetDataStorageCommand): Promise<DataStorageDto> {
    const dataStorageEntity = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.id
    );

    if (command.userId) {
      const canSee = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        command.id,
        Action.SEE,
        command.projectId
      );
      if (!canSee) {
        throw new ForbiddenException('You do not have access to this Storage');
      }
    }

    const allUserIds = [
      ...(dataStorageEntity.createdById ? [dataStorageEntity.createdById] : []),
      ...dataStorageEntity.ownerIds,
    ];
    const userProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);

    const createdByUser = dataStorageEntity.createdById
      ? (userProjections.getByUserId(dataStorageEntity.createdById) ?? null)
      : null;

    return this.dataStorageMapper.toDomainDto(
      dataStorageEntity,
      0,
      0,
      createdByUser,
      resolveOwnerUsers(dataStorageEntity.ownerIds, userProjections)
    );
  }
}
