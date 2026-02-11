import { Injectable } from '@nestjs/common';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataStorageService } from '../services/data-storage.service';
import { GetDataStorageCommand } from '../dto/domain/get-data-storage.command';

@Injectable()
export class GetDataStorageService {
  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly dataStorageMapper: DataStorageMapper
  ) {}

  async run(command: GetDataStorageCommand): Promise<DataStorageDto> {
    const dataStorageEntity = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.id
    );

    return this.dataStorageMapper.toDomainDto(dataStorageEntity);
  }
}
