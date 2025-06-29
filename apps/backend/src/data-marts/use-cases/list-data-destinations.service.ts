import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';

@Injectable()
export class ListDataDestinationsService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepo: Repository<DataDestination>,
    private readonly mapper: DataDestinationMapper
  ) {}

  async run(command: ListDataDestinationsCommand): Promise<DataDestinationDto[]> {
    const dataDestinations = await this.dataDestinationRepo.find({
      where: { projectId: command.projectId },
    });
    return this.mapper.toDomainDtoList(dataDestinations);
  }
}
