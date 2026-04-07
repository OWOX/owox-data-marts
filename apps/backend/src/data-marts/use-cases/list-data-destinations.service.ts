import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class ListDataDestinationsService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepo: Repository<DataDestination>,
    private readonly mapper: DataDestinationMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async run(command: ListDataDestinationsCommand): Promise<DataDestinationDto[]> {
    const isAdmin = command.roles.includes('admin');

    let qb = this.dataDestinationRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.owners', 'owners')
      .where('d.projectId = :projectId', { projectId: command.projectId })
      .andWhere('d.deletedAt IS NULL');

    if (!isAdmin) {
      // Non-admin: own + shared_for_use + shared_for_maintenance
      qb = qb.andWhere(
        `(EXISTS (SELECT 1 FROM destination_owners o WHERE o.destination_id = d.id AND o.user_id = :userId)
          OR d.sharedForUse = 1
          OR d.sharedForMaintenance = 1)`,
        { userId: command.userId }
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
