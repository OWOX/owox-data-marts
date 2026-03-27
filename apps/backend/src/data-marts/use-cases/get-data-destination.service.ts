import { Injectable } from '@nestjs/common';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DataDestinationService } from '../services/data-destination.service';
import { GetDataDestinationCommand } from '../dto/domain/get-data-destination.command';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

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

    const createdByUser =
      await this.userProjectionsFetcherService.fetchCreatedByUser(dataDestinationEntity);

    return this.dataDestinationMapper.toDomainDto(dataDestinationEntity, createdByUser);
  }
}
