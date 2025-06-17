import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataStorage } from '../entities/data-storage.entity';
import { CreateDataStorageApiDto } from '../dto/presentation/create-data-storage-api.dto';
import { CreateDataStorageCommand } from '../dto/domain/create-data-storage.command';
import { UpdateDataStorageApiDto } from '../dto/presentation/update-data-storage-api.dto';
import { UpdateDataStorageCommand } from '../dto/domain/update-data-storage.command';
import { DataStorageResponseApiDto } from '../dto/presentation/data-storage-response-api.dto';
import { DataStorageTitleFacade } from '../data-storage-types/facades/data-storage-title.facade';
import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../common/authorization-context/authorization.context';
import { GetDataStorageCommand } from '../dto/domain/get-data-storage.command';
import { DataStorageListResponseApiDto } from '../dto/presentation/data-storage-list-response-api.dto';
import { DeleteDataStorageCommand } from '../dto/domain/delete-data-storage.command';

@Injectable()
export class DataStorageMapper {
  constructor(private readonly dataStorageTitleFacade: DataStorageTitleFacade) {}

  toCreateCommand(
    context: AuthorizationContext,
    dto: CreateDataStorageApiDto
  ): CreateDataStorageCommand {
    return new CreateDataStorageCommand(context.projectId, dto.type);
  }

  toUpdateCommand(
    id: string,
    context: AuthorizationContext,
    dto: UpdateDataStorageApiDto
  ): UpdateDataStorageCommand {
    return new UpdateDataStorageCommand(id, context.projectId, dto.credentials, dto.config);
  }

  toDomainDto(dataStorage: DataStorage): DataStorageDto {
    return new DataStorageDto(
      dataStorage.id,
      this.dataStorageTitleFacade.generate(dataStorage.type, dataStorage.config),
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

  toGetCommand(id: string, context: AuthorizationContext) {
    return new GetDataStorageCommand(id, context.projectId);
  }

  toListItem(dto: DataStorageDto): DataStorageListResponseApiDto {
    return {
      id: dto.id,
      title: dto.title,
      type: dto.type,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  toDeleteCommand(id: string, context: AuthorizationContext): DeleteDataStorageCommand {
    return new DeleteDataStorageCommand(id, context);
  }
}
