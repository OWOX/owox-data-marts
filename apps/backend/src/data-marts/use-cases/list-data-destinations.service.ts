import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { RoleScope } from '../enums/role-scope.enum';
import { ContextAccessService } from '../services/context/context-access.service';
import { applyDataDestinationVisibilityFilter } from '../utils/apply-data-destination-visibility-filter';
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
    const roleScope: RoleScope = isAdmin
      ? RoleScope.ENTIRE_PROJECT
      : await this.contextAccessService.getRoleScope(command.userId, command.projectId);

    let qb = this.dataDestinationRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.owners', 'owners')
      .leftJoinAndSelect('d.contexts', 'dContexts')
      .leftJoinAndSelect('dContexts.context', 'dContext')
      .where('d.projectId = :projectId', { projectId: command.projectId })
      .andWhere('d.deletedAt IS NULL');

    qb = applyDataDestinationVisibilityFilter(qb, {
      destinationAlias: 'd',
      projectId: command.projectId,
      userId: command.userId,
      roles: command.roles,
      roleScope,
    });

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
