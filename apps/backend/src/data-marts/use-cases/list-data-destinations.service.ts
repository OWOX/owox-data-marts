import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
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
    const dataDestinations = await this.dataDestinationRepo.find({
      where: { projectId: command.projectId },
    });

    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(dataDestinations);

    return this.mapper.toDomainDtoList(dataDestinations, userProjectionsList);
  }
}
