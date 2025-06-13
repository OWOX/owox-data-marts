import { Injectable } from '@nestjs/common';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataStorageService } from '../services/data-storage.service';

@Injectable()
export class GetDataStorageService {
  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly dataStorageMapper: DataStorageMapper
  ) {}

  async run(projectId: string, id: string): Promise<DataStorageDto> {
    const dataStorageEntity = await this.dataStorageService.getByIdAndProjectId(projectId, id);

    return this.dataStorageMapper.toDomainDto(dataStorageEntity);
  }
}
