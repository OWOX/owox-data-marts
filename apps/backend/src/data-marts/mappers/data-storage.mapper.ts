import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AuthorizationContext } from '../../idp';
import { isPluginRuntimeCall } from '../../idp/utils/is-plugin-runtime-call';
import {
  DataStorageType,
  toHumanReadable,
} from '../data-storage-types/enums/data-storage-type.enum';
import { ValidationResult } from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { CreateDataStorageCommand } from '../dto/domain/create-data-storage.command';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DeleteDataStorageCommand } from '../dto/domain/delete-data-storage.command';
import { GetDataStorageCommand } from '../dto/domain/get-data-storage.command';
import { ListDataStoragesCommand } from '../dto/domain/list-data-storages.command';
import { ListStorageResourcesCommand } from '../dto/domain/list-storage-resources.command';
import { ListStorageResourcesQueryDto } from '../dto/presentation/storage-resources/list-storage-resources-query.dto';
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
import { DataStorageByTypeResponseApiDto } from '../dto/presentation/data-storage-by-type-response-api.dto';
import { StorageCredentialSummaryApiDto } from '../dto/presentation/storage-credential-summary-api.dto';
import type { StorageCredentialSummary } from '../data-storage-types/storage-credential-state';
import { ListDataStoragesByTypeItemDto } from '../dto/domain/list-data-storages-by-type-item.dto';
import { ListDataStoragesByTypeCommand } from '../dto/domain/list-data-storages-by-type.command';
import { DataStorage } from '../entities/data-storage.entity';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { extractContextSummaries, ContextSummary } from '../utils/extract-context-summaries';

@Injectable()
export class DataStorageMapper {
  constructor(private readonly cls: ClsService) {}

  toCreateCommand(
    context: AuthorizationContext,
    dto: CreateDataStorageApiDto
  ): CreateDataStorageCommand {
    return new CreateDataStorageCommand(context.projectId, dto.type, context.userId, dto.ownerIds);
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
      dto.reusableCredentialId,
      // Legacy: the old credential fields go with LegacyStorageCredentialReader.
      dto.credentials !== undefined ||
        dto.credentialId !== undefined ||
        dto.sourceStorageId !== undefined,
      context.authFlow === 'plugin',
      dto.ownerIds,
      context.userId,
      context.roles ?? [],
      dto.availableForUse,
      dto.availableForMaintenance,
      dto.contextIds
    );
  }

  toDomainDto(
    dataStorage: DataStorage,
    publishedCount = 0,
    draftsCount = 0,
    createdByUser: UserProjectionDto | null = null,
    ownerUsers: UserProjectionDto[] = [],
    contexts?: ContextSummary[],
    reusableCredential?: StorageCredentialSummary | null
  ): DataStorageDto {
    return new DataStorageDto(
      dataStorage.id,
      dataStorage.title || toHumanReadable(dataStorage.type),
      dataStorage.type,
      dataStorage.projectId,
      dataStorage.config,
      dataStorage.createdAt,
      dataStorage.modifiedAt,
      publishedCount,
      draftsCount,
      createdByUser,
      ownerUsers,
      dataStorage.availableForUse,
      dataStorage.availableForMaintenance,
      contexts ?? extractContextSummaries(dataStorage.contexts),
      reusableCredential
    );
  }

  async toApiResponse(dataStorageDto: DataStorageDto): Promise<DataStorageResponseApiDto> {
    return {
      id: dataStorageDto.id,
      title: dataStorageDto.title,
      type: dataStorageDto.type,
      projectId: dataStorageDto.projectId,
      config: dataStorageDto.config,
      createdAt: dataStorageDto.createdAt,
      modifiedAt: dataStorageDto.modifiedAt,
      createdByUser: dataStorageDto.createdByUser,
      ownerUsers: dataStorageDto.ownerUsers,
      availableForUse: dataStorageDto.availableForUse,
      availableForMaintenance: dataStorageDto.availableForMaintenance,
      contexts: dataStorageDto.contexts,
      ...(dataStorageDto.reusableCredential !== undefined && {
        reusableCredential: this.toCredentialSummaryResponse(dataStorageDto.reusableCredential),
      }),
    };
  }

  toGetCommand(id: string, context: AuthorizationContext) {
    return new GetDataStorageCommand(id, context.projectId, context.userId, context.roles ?? []);
  }

  toListStorageResourcesCommand(
    id: string,
    context: AuthorizationContext,
    query: ListStorageResourcesQueryDto
  ): ListStorageResourcesCommand {
    return new ListStorageResourcesCommand(
      id,
      context.projectId,
      context.userId,
      context.roles ?? [],
      query.level,
      query.namespaceId,
      query.resourceType
    );
  }

  toListCommand(context: AuthorizationContext, ownerFilter?: OwnerFilter) {
    return new ListDataStoragesCommand(
      context.projectId,
      context.userId,
      context.roles ?? [],
      ownerFilter
    );
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
      createdByUser: dataStorageDto.createdByUser,
      ownerUsers: dataStorageDto.ownerUsers,
      contexts: dataStorageDto.contexts,
      availableForUse: dataStorageDto.availableForUse,
      availableForMaintenance: dataStorageDto.availableForMaintenance,
      reusableCredential: this.toCredentialSummaryResponse(
        dataStorageDto.reusableCredential ?? null
      ),
    }));
  }

  /** Built field by field so a restricted summary never carries the Credential's details. */
  private toCredentialSummaryResponse(
    summary: StorageCredentialSummary | null
  ): StorageCredentialSummaryApiDto | null {
    if (!summary) return null;
    // Names no Credential, so plugins get it as is.
    if (summary.access === 'pending') return { access: 'pending', state: summary.state };
    // A plugin acts as the member but never learns which Credential a Storage uses.
    if (summary.access === 'restricted' || isPluginRuntimeCall(this.cls)) {
      return { access: 'restricted', state: summary.state };
    }
    return {
      access: 'visible',
      id: summary.id,
      title: summary.title,
      definitionId: summary.definitionId,
      providerName: summary.providerName,
      identity: summary.identity,
      state: summary.state,
    };
  }

  toDeleteCommand(id: string, context: AuthorizationContext): DeleteDataStorageCommand {
    return new DeleteDataStorageCommand(id, context.projectId, context.userId, context.roles ?? []);
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
    return new ValidateDataStorageAccessCommand(
      id,
      context.projectId,
      context.userId,
      context.roles ?? []
    );
  }

  toValidateAccessResponse(
    validationResult: ValidationResult
  ): DataStorageAccessValidationResponseApiDto {
    return {
      valid: validationResult.valid,
      errorMessage: validationResult.errorMessage,
      code: validationResult.code,
    };
  }

  toByTypeCommand(
    context: AuthorizationContext,
    type: DataStorageType
  ): ListDataStoragesByTypeCommand {
    return new ListDataStoragesByTypeCommand(
      context.projectId,
      type,
      context.userId,
      context.roles ?? [],
      isPluginRuntimeCall(this.cls)
    );
  }

  toByTypeResponse(items: ListDataStoragesByTypeItemDto[]): DataStorageByTypeResponseApiDto[] {
    return items.map(item => ({
      id: item.id,
      title: item.title,
      dataMartName: item.dataMartName,
      identity: item.identity,
    }));
  }

  toPublishDraftsResponse(
    result: PublishDataStorageDraftsResultDto
  ): PublishDataStorageDraftsResponseApiDto {
    return {
      successCount: result.successCount,
      failedCount: result.failedCount,
      failureReasons: result.failureReasons,
    };
  }
}
