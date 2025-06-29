import { Injectable } from '@nestjs/common';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DataDestinationService } from '../services/data-destination.service';
import { GetDataDestinationCommand } from '../dto/domain/get-data-destination.command';

@Injectable()
export class GetDataDestinationService {
  constructor(
    private readonly dataDestinationService: DataDestinationService,
    private readonly dataDestinationMapper: DataDestinationMapper
  ) {}

  async run(command: GetDataDestinationCommand): Promise<DataDestinationDto> {
    const dataDestinationEntity = await this.dataDestinationService.getByIdAndProjectId(
      command.projectId,
      command.id
    );

    return this.dataDestinationMapper.toDomainDto(dataDestinationEntity);
  }
}
