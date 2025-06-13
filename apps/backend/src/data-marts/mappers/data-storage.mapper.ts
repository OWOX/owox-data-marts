import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataStorage } from '../entities/data-storage.entity';
import { CreateDataStorageApiDto } from '../dto/presentation/create-data-storage-api.dto';
import { CreateDataStorageCommand } from '../dto/domain/create-data-storage.command';
import { UpdateDataStorageApiDto } from '../dto/presentation/update-data-storage-api.dto';
import { UpdateDataStorageCommand } from '../dto/domain/update-data-storage.command';
import { DataStorageResponseApiDto } from '../dto/presentation/data-storage-response-api.dto';
import { DataStorageTitleService } from '../services/data-storage-title.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DataStorageMapper {
  constructor(private readonly dataStorageTitleService: DataStorageTitleService) {}

  toCreateCommand(dto: CreateDataStorageApiDto): CreateDataStorageCommand {
    return new CreateDataStorageCommand(dto.type);
  }

  toUpdateCommand(dto: UpdateDataStorageApiDto): UpdateDataStorageCommand {
    return new UpdateDataStorageCommand(dto.credentials, dto.config);
  }

  toDomainDto(dataStorage: DataStorage): DataStorageDto {
    return new DataStorageDto(
      dataStorage.id,
      this.dataStorageTitleService.generate(dataStorage.type, dataStorage.config),
      dataStorage.type,
      dataStorage.projectId,
      dataStorage.credentials,
      dataStorage.config,
      dataStorage.createdAt,
      dataStorage.modifiedAt
    );
  }

  toApiResponse(dataStorageDto: DataStorageDto): DataStorageResponseApiDto {
    return {
      id: dataStorageDto.id,
      title: dataStorageDto.title,
      type: dataStorageDto.type,
      projectId: dataStorageDto.projectId,
      credentials: dataStorageDto.credentials,
      config: dataStorageDto.config,
      createdAt: dataStorageDto.createdAt,
      modifiedAt: dataStorageDto.modifiedAt,
    };
  }
}
