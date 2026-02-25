import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BigQueryConfig } from '../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { DataStorageCredentials } from '../data-storage-types/data-storage-credentials.type';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { UpdateDataStorageCommand } from '../dto/domain/update-data-storage.command';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageService } from '../services/data-storage.service';
import { DataStorageAccessValidatorFacade } from '../data-storage-types/facades/data-storage-access-validator-facade.service';
import { DataStorageCredentialService } from '../services/data-storage-credential.service';
import { StorageCredentialType } from '../enums/storage-credential-type.enum';
import {
  resolveStorageCredentialType,
  extractStorageIdentity,
} from '../services/credential-type-resolver';

@Injectable()
export class UpdateDataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    private readonly dataStorageService: DataStorageService,
    private readonly dataStorageMapper: DataStorageMapper,
    private readonly dataStorageAccessFacade: DataStorageAccessValidatorFacade,
    private readonly dataStorageCredentialService: DataStorageCredentialService
  ) {}

  async run(command: UpdateDataStorageCommand): Promise<DataStorageDto> {
    const dataStorageEntity = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.id
    );

    let credentialsToCheck: DataStorageCredentials | undefined = command.credentials;
    if (!command.hasCredentials() && dataStorageEntity.credentialId) {
      const existingCred = await this.dataStorageCredentialService.getById(
        dataStorageEntity.credentialId
      );
      credentialsToCheck = existingCred?.credentials as DataStorageCredentials | undefined;
    }

    const isLegacyStorage = dataStorageEntity.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY;
    if (isLegacyStorage && command.hasConfig()) {
      (command.config as BigQueryConfig).projectId = (
        dataStorageEntity.config as BigQueryConfig
      ).projectId;
    }

    // When credentialId is explicitly null, the user is disconnecting OAuth.
    // Soft-delete the credential record and clear the entity field before access validation.
    if (command.credentialId === null && dataStorageEntity.credentialId) {
      const credential = await this.dataStorageCredentialService.getById(
        dataStorageEntity.credentialId
      );
      if (credential?.type === StorageCredentialType.GOOGLE_OAUTH) {
        await this.dataStorageCredentialService.softDelete(credential.id);
      }
      dataStorageEntity.credentialId = null;
    }

    // Skip access validation for OAuth-configured storages (tokens are validated during OAuth exchange).
    // Only skip when not submitting new service account credentials (which would indicate switching back to SA).
    const isOAuthStorage = !!dataStorageEntity.credentialId && !command.hasCredentials();
    if (!isOAuthStorage) {
      await this.dataStorageAccessFacade.verifyAccess(
        dataStorageEntity.type,
        command.config,
        credentialsToCheck ?? ({} as DataStorageCredentials)
      );
    }

    if (command.hasCredentials()) {
      // Create or update credential record in the new table
      const credentialType = resolveStorageCredentialType(
        dataStorageEntity.type,
        command.credentials as Record<string, unknown>
      );
      const identity = extractStorageIdentity(
        credentialType,
        command.credentials as Record<string, unknown>
      );

      if (dataStorageEntity.credentialId) {
        await this.dataStorageCredentialService.update(dataStorageEntity.credentialId, {
          credentials: command.credentials as Record<string, unknown>,
          identity,
        });
      } else {
        const newCredential = await this.dataStorageCredentialService.create({
          projectId: command.projectId,
          type: credentialType,
          credentials: command.credentials as Record<string, unknown>,
          identity,
        });
        dataStorageEntity.credentialId = newCredential.id;
      }
    }

    dataStorageEntity.config = command.config;

    if (!isLegacyStorage) {
      dataStorageEntity.title = command.title;
    }

    const updatedDataStorageEntity = await this.dataStorageRepository.save(dataStorageEntity);
    return this.dataStorageMapper.toDomainDto(updatedDataStorageEntity);
  }
}
