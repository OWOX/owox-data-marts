import { Injectable } from '@nestjs/common';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataStorageService } from '../services/data-storage.service';
import { GetDataStorageCommand } from '../dto/domain/get-data-storage.command';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class GetDataStorageService {
  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly dataStorageMapper: DataStorageMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async run(command: GetDataStorageCommand): Promise<DataStorageDto> {
    const dataStorageEntity = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.id
    );

    const createdByUser =
      await this.userProjectionsFetcherService.fetchCreatedByUser(dataStorageEntity);

    return this.dataStorageMapper.toDomainDto(dataStorageEntity, 0, 0, createdByUser);
  }
}
