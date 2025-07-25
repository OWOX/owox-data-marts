import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../common/authorization-context/authorization.context';
import { getPublicCredentials } from '../data-storage-types/data-mart-schema.utils';
import { toHumanReadable } from '../data-storage-types/enums/data-storage-type.enum';
import { CreateDataStorageCommand } from '../dto/domain/create-data-storage.command';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DeleteDataStorageCommand } from '../dto/domain/delete-data-storage.command';
import { GetDataStorageCommand } from '../dto/domain/get-data-storage.command';
import { ListDataStoragesCommand } from '../dto/domain/list-data-storages.command';
import { UpdateDataStorageCommand } from '../dto/domain/update-data-storage.command';
import { CreateDataStorageApiDto } from '../dto/presentation/create-data-storage-api.dto';
import { DataStorageListResponseApiDto } from '../dto/presentation/data-storage-list-response-api.dto';
import { DataStorageResponseApiDto } from '../dto/presentation/data-storage-response-api.dto';
import { UpdateDataStorageApiDto } from '../dto/presentation/update-data-storage-api.dto';
import { DataStorage } from '../entities/data-storage.entity';

@Injectable()
export class DataStorageMapper {
  constructor() {}

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
    return new UpdateDataStorageCommand(
      id,
      context.projectId,
      dto.config,
      dto.title.trim(),
      dto.credentials
    );
  }

  toDomainDto(dataStorage: DataStorage): DataStorageDto {
    return new DataStorageDto(
      dataStorage.id,
      dataStorage.title || toHumanReadable(dataStorage.type),
      dataStorage.type,
      dataStorage.projectId,
      dataStorage.credentials,
      dataStorage.config,
      dataStorage.createdAt,
      dataStorage.modifiedAt
    );
  }

  toDomainDtoList(dataStorages: DataStorage[]): DataStorageDto[] {
    return dataStorages.map(dataStorage => this.toDomainDto(dataStorage));
  }

  toApiResponse(dataStorageDto: DataStorageDto): DataStorageResponseApiDto {
    return {
      id: dataStorageDto.id,
      title: dataStorageDto.title,
      type: dataStorageDto.type,
      projectId: dataStorageDto.projectId,
      credentials: getPublicCredentials(dataStorageDto.type, dataStorageDto.credentials),
      config: dataStorageDto.config,
      createdAt: dataStorageDto.createdAt,
      modifiedAt: dataStorageDto.modifiedAt,
    };
  }

  toGetCommand(id: string, context: AuthorizationContext) {
    return new GetDataStorageCommand(id, context.projectId);
  }

  toListCommand(context: AuthorizationContext) {
    return new ListDataStoragesCommand(context.projectId);
  }

  toResponseList(dataStorages: DataStorageDto[]): DataStorageListResponseApiDto[] {
    return dataStorages.map(dataStorageDto => ({
      id: dataStorageDto.id,
      title: dataStorageDto.title,
      type: dataStorageDto.type,
      createdAt: dataStorageDto.createdAt,
      modifiedAt: dataStorageDto.modifiedAt,
    }));
  }

  toDeleteCommand(id: string, context: AuthorizationContext): DeleteDataStorageCommand {
    return new DeleteDataStorageCommand(id, context.projectId);
  }
}
