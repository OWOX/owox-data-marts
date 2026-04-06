import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OwoxProducer } from '@owox/internal-helpers';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { BigQueryConfig } from '../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { DataStorageCredentials } from '../data-storage-types/data-storage-credentials.type';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { UpdateDataStorageCommand } from '../dto/domain/update-data-storage.command';
import { DataStorage } from '../entities/data-storage.entity';
import { StorageConfigSetEvent } from '../events/storage-config-set.event';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageService } from '../services/data-storage.service';
import { DataStorageAccessValidatorFacade } from '../data-storage-types/facades/data-storage-access-validator-facade.service';
import { DataStorageCredentialService } from '../services/data-storage-credential.service';
import { StorageCredentialType } from '../enums/storage-credential-type.enum';
import {
  resolveStorageCredentialType,
  extractStorageIdentity,
} from '../services/credential-type-resolver';
import type { StoredStorageCredentials } from '../entities/stored-storage-credentials.type';
import { CopyCredentialService } from '../services/copy-credential.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { StorageOwner } from '../entities/storage-owner.entity';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { syncOwners } from '../utils/sync-owners';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

@Injectable()
export class UpdateDataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    private readonly dataStorageService: DataStorageService,
    private readonly dataStorageMapper: DataStorageMapper,
    private readonly dataStorageAccessFacade: DataStorageAccessValidatorFacade,
    private readonly dataStorageCredentialService: DataStorageCredentialService,
    private readonly copyCredentialService: CopyCredentialService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    @InjectRepository(StorageOwner)
    private readonly storageOwnerRepository: Repository<StorageOwner>,
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer
  ) {}

  @Transactional()
  async run(command: UpdateDataStorageCommand): Promise<DataStorageDto> {
    const dataStorageEntity = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.id
    );

    const isLegacyStorage = dataStorageEntity.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY;
    const configWasEmpty = !dataStorageEntity.config;

    if (command.sourceStorageId && command.hasCredentials()) {
      throw new BadRequestException(
        'Cannot provide both sourceStorageId and credentials in the same request'
      );
    }

    if (command.sourceStorageId && command.credentialId) {
      throw new BadRequestException('Cannot provide both sourceStorageId and credentialId');
    }

    if (command.sourceStorageId === command.id) {
      throw new BadRequestException('Cannot copy credentials from a storage to itself');
    }

    if (command.sourceStorageId) {
      const source = await this.dataStorageService.getByProjectIdAndId(
        command.projectId,
        command.sourceStorageId
      );
      if (!source.credentialId || !source.credential) {
        throw new BadRequestException('Source storage has no credentials to copy');
      }
      if (source.type !== dataStorageEntity.type) {
        throw new BadRequestException(
          `Cannot copy credentials from ${source.type} to ${dataStorageEntity.type} storage`
        );
      }

      const newCredId = await this.copyCredentialService.copyStorageCredential(
        command.projectId,
        dataStorageEntity.credentialId ?? null,
        source.credential
      );
      if (newCredId) {
        dataStorageEntity.credentialId = newCredId;
        dataStorageEntity.credential = null;
      }

      dataStorageEntity.config = command.config;
      if (!isLegacyStorage) {
        dataStorageEntity.title = command.title;
      }
      const updatedDataStorageEntity = await this.dataStorageRepository.save(dataStorageEntity);

      if (configWasEmpty && updatedDataStorageEntity.config) {
        await this.producer.produceEvent(
          new StorageConfigSetEvent(
            updatedDataStorageEntity.id,
            updatedDataStorageEntity.projectId,
            updatedDataStorageEntity.createdById ?? ''
          )
        );
      }

      return this.replaceOwnersAndBuildResponse(updatedDataStorageEntity, command.ownerIds);
    }

    let credentialsToCheck: DataStorageCredentials | undefined = command.credentials;
    if (!command.hasCredentials() && dataStorageEntity.credential) {
      credentialsToCheck = dataStorageEntity.credential.credentials as
        | DataStorageCredentials
        | undefined;
    }
    if (isLegacyStorage && command.hasConfig()) {
      (command.config as BigQueryConfig).projectId = (
        dataStorageEntity.config as BigQueryConfig
      ).projectId;
    }

    // When credentialId is explicitly null, the user is disconnecting OAuth.
    // Soft-delete the credential record and clear the entity field before access validation.
    if (command.credentialId === null && dataStorageEntity.credential) {
      if (dataStorageEntity.credential.type === StorageCredentialType.GOOGLE_OAUTH) {
        await this.dataStorageCredentialService.softDelete(dataStorageEntity.credential.id);
      }
      dataStorageEntity.credentialId = null;
      // Clear the eagerly-loaded relation so TypeORM save() does not
      // overwrite credentialId with the stale (soft-deleted) relation id.
      dataStorageEntity.credential = null;
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
        command.credentials as StoredStorageCredentials
      );
      const identity = extractStorageIdentity(
        credentialType,
        command.credentials as StoredStorageCredentials
      );

      if (dataStorageEntity.credentialId) {
        await this.dataStorageCredentialService.update(dataStorageEntity.credentialId, {
          type: credentialType,
          credentials: command.credentials as StoredStorageCredentials,
          identity,
        });
      } else {
        const newCredential = await this.dataStorageCredentialService.create({
          projectId: command.projectId,
          type: credentialType,
          credentials: command.credentials as StoredStorageCredentials,
          identity,
        });
        dataStorageEntity.credentialId = newCredential.id;
        dataStorageEntity.credential = null;
      }
    }

    dataStorageEntity.config = command.config;

    if (!isLegacyStorage) {
      dataStorageEntity.title = command.title;
    }

    const updatedDataStorageEntity = await this.dataStorageRepository.save(dataStorageEntity);

    if (configWasEmpty && updatedDataStorageEntity.config) {
      await this.producer.produceEvent(
        new StorageConfigSetEvent(
          updatedDataStorageEntity.id,
          updatedDataStorageEntity.projectId,
          updatedDataStorageEntity.createdById ?? ''
        )
      );
    }

    return this.replaceOwnersAndBuildResponse(updatedDataStorageEntity, command.ownerIds);
  }

  private async replaceOwnersAndBuildResponse(
    entity: DataStorage,
    ownerIds?: string[]
  ): Promise<DataStorageDto> {
    if (ownerIds !== undefined) {
      await syncOwners(
        this.storageOwnerRepository,
        'storageId',
        entity.id,
        entity.projectId,
        ownerIds,
        this.idpProjectionsFacade,
        userId => {
          const o = new StorageOwner();
          o.storageId = entity.id;
          o.userId = userId;
          return o;
        }
      );
    }

    // Reload to get fresh owners
    const fresh = await this.dataStorageService.getByProjectIdAndId(entity.projectId, entity.id);
    const allUserIds = [...(fresh.createdById ? [fresh.createdById] : []), ...fresh.ownerIds];
    const userProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);
    const createdByUser = fresh.createdById
      ? (userProjections.getByUserId(fresh.createdById) ?? null)
      : null;
    return this.dataStorageMapper.toDomainDto(
      fresh,
      0,
      0,
      createdByUser,
      resolveOwnerUsers(fresh.ownerIds, userProjections)
    );
  }
}
