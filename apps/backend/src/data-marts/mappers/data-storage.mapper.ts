import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { DataStorageCredentialsUtils } from '../data-storage-types/data-mart-schema.utils';
import { toHumanReadable } from '../data-storage-types/enums/data-storage-type.enum';
import { ValidationResult } from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { CreateDataStorageCommand } from '../dto/domain/create-data-storage.command';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DeleteDataStorageCommand } from '../dto/domain/delete-data-storage.command';
import { GetDataStorageCommand } from '../dto/domain/get-data-storage.command';
import { ListDataStoragesCommand } from '../dto/domain/list-data-storages.command';
import { UpdateDataStorageCommand } from '../dto/domain/update-data-storage.command';
import { PublishDataStorageDraftsCommand } from '../dto/domain/publish-data-storage-drafts.command';
import { PublishDataStorageDraftsResultDto } from '../dto/domain/publish-data-storage-drafts-result.dto';
import { ValidateDataStorageAccessCommand } from '../dto/domain/validate-data-storage-access.command';
import { CreateDataStorageApiDto } from '../dto/presentation/create-data-storage-api.dto';
import { DataStorageAccessValidationResponseApiDto } from '../dto/presentation/data-storage-access-validation-response-api.dto';
import { DataStorageListResponseApiDto } from '../dto/presentation/data-storage-list-response-api.dto';
import { DataStorageResponseApiDto } from '../dto/presentation/data-storage-response-api.dto';
import { UpdateDataStorageApiDto } from '../dto/presentation/update-data-storage-api.dto';
import { PublishDataStorageDraftsResponseApiDto } from '../dto/presentation/publish-data-storage-drafts-response-api.dto';
import { DataStorage } from '../entities/data-storage.entity';

@Injectable()
export class DataStorageMapper {
  constructor(private readonly credentialsUtils: DataStorageCredentialsUtils) {}

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

  toDomainDto(dataStorage: DataStorage, publishedCount = 0, draftsCount = 0): DataStorageDto {
    return new DataStorageDto(
      dataStorage.id,
      dataStorage.title || toHumanReadable(dataStorage.type),
      dataStorage.type,
      dataStorage.projectId,
      dataStorage.credentials,
      dataStorage.config,
      dataStorage.createdAt,
      dataStorage.modifiedAt,
      publishedCount,
      draftsCount
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
      credentials: this.credentialsUtils.getPublicCredentials(
        dataStorageDto.type,
        dataStorageDto.credentials
      ),
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
      publishedDataMartsCount: dataStorageDto.dataMartsCount,
      draftDataMartsCount: dataStorageDto.draftsCount,
    }));
  }

  toDeleteCommand(id: string, context: AuthorizationContext): DeleteDataStorageCommand {
    return new DeleteDataStorageCommand(id, context.projectId);
  }

  toPublishDraftsCommand(
    id: string,
    context: AuthorizationContext
  ): PublishDataStorageDraftsCommand {
    return new PublishDataStorageDraftsCommand(id, context.projectId, context.userId);
  }

  toValidateAccessCommand(
    id: string,
    context: AuthorizationContext
  ): ValidateDataStorageAccessCommand {
    return new ValidateDataStorageAccessCommand(id, context.projectId);
  }

  toValidateAccessResponse(
    validationResult: ValidationResult
  ): DataStorageAccessValidationResponseApiDto {
    return {
      valid: validationResult.valid,
      errorMessage: validationResult.errorMessage,
    };
  }

  toPublishDraftsResponse(
    result: PublishDataStorageDraftsResultDto
  ): PublishDataStorageDraftsResponseApiDto {
    return {
      successCount: result.successCount,
      failedCount: result.failedCount,
    };
  }
}
