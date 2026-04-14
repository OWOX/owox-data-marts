import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { ContextAccessService } from '../services/context/context-access.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class ListDataDestinationsService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepo: Repository<DataDestination>,
    private readonly mapper: DataDestinationMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly contextAccessService: ContextAccessService
  ) {}

  async run(command: ListDataDestinationsCommand): Promise<DataDestinationDto[]> {
    const isAdmin = command.roles.includes('admin');
    const roleScope = isAdmin
      ? 'entire_project'
      : await this.contextAccessService.getRoleScope(command.userId, command.projectId);

    let qb = this.dataDestinationRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.owners', 'owners')
      .leftJoinAndSelect('d.contexts', 'dContexts')
      .leftJoinAndSelect('dContexts.context', 'dContext')
      .where('d.projectId = :projectId', { projectId: command.projectId })
      .andWhere('d.deletedAt IS NULL');

    if (!isAdmin) {
      // Non-admin: own OR (shared access with context gate)
      qb = qb.andWhere(
        `(
          EXISTS (SELECT 1 FROM destination_owners o WHERE o.destination_id = d.id AND o.user_id = :userId)
          OR (
            (d.availableForUse = :isTrue OR d.availableForMaintenance = :isTrue)
            AND (
              :roleScope = 'entire_project'
              OR EXISTS (
                SELECT 1 FROM destination_contexts dc
                JOIN member_role_contexts mrc ON mrc.context_id = dc.context_id
                WHERE dc.destination_id = d.id
                AND mrc.user_id = :userId AND mrc.project_id = :projectId
              )
            )
          )
        )`,
        { userId: command.userId, isTrue: true, roleScope, projectId: command.projectId }
      );
    }

    if (command.ownerFilter === OwnerFilter.HAS_OWNERS) {
      qb = qb.andWhere('EXISTS (SELECT 1 FROM destination_owners o WHERE o.destination_id = d.id)');
    } else if (command.ownerFilter === OwnerFilter.NO_OWNERS) {
      qb = qb.andWhere(
        'NOT EXISTS (SELECT 1 FROM destination_owners o WHERE o.destination_id = d.id)'
      );
    }

    const dataDestinations = await qb.getMany();

    const allUserIds = dataDestinations.flatMap(d => [
      ...(d.createdById ? [d.createdById] : []),
      ...d.ownerIds,
    ]);
    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);

    return this.mapper.toDomainDtoList(dataDestinations, userProjectionsList);
  }
}
