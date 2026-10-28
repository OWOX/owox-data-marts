import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import {
  BigQueryConfig,
  BigQueryConfigSchema,
} from '../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { DataStorageCredentials } from '../data-storage-types/data-storage-credentials.type';
import { ValidationResult } from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { UpdateDataStorageCommand } from '../dto/domain/update-data-storage.command';
import { DataStorage } from '../entities/data-storage.entity';
import { StorageConfigSetEvent } from '../events/storage-config-set.event';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageService } from '../services/data-storage.service';
import { DataStorageAccessValidatorFacade } from '../data-storage-types/facades/data-storage-access-validator-facade.service';
import { DataStorageCredentialsResolver } from '../data-storage-types/data-storage-credentials-resolver.service';
import {
  changesConnectionTarget,
  invalidStorageConfig,
  sameStorageConfig,
  storableStorageConfig,
} from '../data-storage-types/storage-credential-definitions';
import { AccessValidationException } from '../../common/exceptions/access-validation.exception';
import { StorageCredentialUnavailableException } from '../exceptions/storage-credential-unavailable.exception';
import { StorageCredentialBindingService } from '../data-storage-types/storage-credential-binding.service';
import { LegacyStorageCredentialReader } from '../services/storage-credential-conversion/legacy-storage-credential-reader.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { StorageOwner } from '../entities/storage-owner.entity';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { syncOwners } from '../utils/sync-owners';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { ContextAccessService } from '../services/context/context-access.service';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';

@Injectable()
export class UpdateDataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    private readonly dataStorageService: DataStorageService,
    private readonly dataStorageMapper: DataStorageMapper,
    private readonly dataStorageAccessFacade: DataStorageAccessValidatorFacade,
    private readonly credentialsResolver: DataStorageCredentialsResolver,
    private readonly storageCredentials: StorageCredentialBindingService,
    private readonly legacy: LegacyStorageCredentialReader,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    @InjectRepository(StorageOwner)
    private readonly storageOwnerRepository: Repository<StorageOwner>,
    private readonly eventDispatcher: OwoxEventDispatcher,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly contextAccessService: ContextAccessService,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
  ) {}

  async run(command: UpdateDataStorageCommand): Promise<DataStorageDto> {
    rejectCredentialFields(command);

    // Permissions Model: if ownerIds are being changed, check MANAGE_OWNERS permission
    if (command.ownerIds !== undefined && command.userId) {
      const canManage = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        command.id,
        Action.MANAGE_OWNERS,
        command.projectId
      );
      if (!canManage) {
        throw new ForbiddenException(
          'You do not have permission to manage owners of this Storage. You must be an owner with the Data Owner role, or a Project Admin.'
        );
      }
    }

    // Permissions Model: if availability is being changed, check CONFIGURE_SHARING permission
    if (
      (command.availableForUse !== undefined || command.availableForMaintenance !== undefined) &&
      command.userId
    ) {
      const canConfigure = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        command.id,
        Action.CONFIGURE_SHARING,
        command.projectId
      );
      if (!canConfigure) {
        throw new ForbiddenException(
          'You do not have permission to configure sharing for this Storage. You must be an owner with the Data Owner role, or a Project Admin.'
        );
      }
    }

    const dataStorageEntity = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.id
    );

    // Permissions Model: verify user has EDIT access to this Storage
    if (command.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        command.id,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to edit this Storage');
      }
    }

    if (dataStorageEntity.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY && command.hasConfig()) {
      (command.config as BigQueryConfig).projectId = (
        dataStorageEntity.config as BigQueryConfig
      ).projectId;
    }

    // Validate BigQuery config format regardless of credential type.
    // The full verifyAccess below is skipped when nothing it checks changes, so without this
    // an invalid projectId would only surface during data mart execution.
    if (
      (dataStorageEntity.type === DataStorageType.GOOGLE_BIGQUERY ||
        dataStorageEntity.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) &&
      command.hasConfig()
    ) {
      const parsed = BigQueryConfigSchema.safeParse(command.config);
      if (!parsed.success) {
        // Same `errorDetails` as a validator's schema failure, so the storage form highlights the
        // field either way. A BadRequestException keeps the handled-400 log line and requestId;
        // GlobalExceptionFilter adds statusCode, timestamp and path to this object, and `error`
        // keeps the key the plain-string form of this exception used to send.
        const invalid = ValidationResult.invalidInput('config', parsed.error);
        throw new BadRequestException({
          message: invalid.errorMessage,
          error: 'Bad Request',
          errorDetails: invalid.reason,
        });
      }
    }

    const configWasEmpty = !dataStorageEntity.config;
    // No transaction yet: a token refresh or lost-grant mark commits even when the check fails.
    const redirected = await this.verifyCredential(command, dataStorageEntity);
    const saved = await this.save(command, redirected);
    // After the commit, so a save rolled back by its last checks sends nothing.
    if (configWasEmpty && saved.config) {
      await this.eventDispatcher.publishExternal(
        new StorageConfigSetEvent(saved.id, saved.projectId, saved.createdById ?? '')
      );
    }
    return this.buildResponse(saved, command);
  }

  /** Read-only checks and the access check; returns the Credential checked for USE, or null. */
  private async verifyCredential(
    command: UpdateDataStorageCommand,
    storage: DataStorage
  ): Promise<string | null> {
    if (
      command.isPluginAuth &&
      changesConnectionTarget(storage.type, storage.config, command.config)
    ) {
      throw new ForbiddenException("Plugins cannot change where a Storage's key is sent.");
    }
    const member = { projectId: command.projectId, userId: command.userId, roles: command.roles };
    if (typeof command.reusableCredentialId === 'string') {
      const candidate = await this.storageCredentials.checkStorageBinding({
        ...member,
        credentialId: command.reusableCredentialId,
        type: storage.type,
      });
      await this.dataStorageAccessFacade.verifyAccess(
        storage.type,
        command.config,
        await this.credentialsResolver.resolveCredential(storage, candidate)
      );
      return null;
    }
    const bound = await this.storageCredentials.resolveForStorage(storage);
    if (!bound) {
      // Legacy: no access check on the old key, as before the conversion; the config must still fit.
      if (this.legacy.hasOldKey(storage)) {
        if (!sameStorageConfig(storage.type, storage.config, command.config)) {
          assertConfigFits(storage.type, command.config);
        }
        return null;
      }
      // With neither a Credential nor an old row to check, the validator rejects the save.
      await this.dataStorageAccessFacade.verifyAccess(
        storage.type,
        command.config,
        {} as DataStorageCredentials
      );
      return null;
    }
    if (sameStorageConfig(storage.type, storage.config, command.config)) return null;
    const redirected = changesConnectionTarget(storage.type, storage.config, command.config)
      ? bound.credentialId
      : null;
    if (redirected) {
      await this.storageCredentials.assertCanUseCredential({
        ...member,
        credentialId: redirected,
      });
    }
    let credentials: DataStorageCredentials;
    try {
      credentials = await this.credentialsResolver.resolveCredential(storage, bound);
    } catch (error) {
      if (!(error instanceof StorageCredentialUnavailableException)) throw error;
      // An unusable Credential must not block edits, but the config must still fit its schema.
      assertConfigFits(storage.type, command.config);
      return redirected;
    }
    await this.dataStorageAccessFacade.verifyAccess(storage.type, command.config, credentials);
    return redirected;
  }

  @Transactional()
  private async save(
    command: UpdateDataStorageCommand,
    redirected: string | null
  ): Promise<DataStorage> {
    // The checks ran outside this transaction: saving that read would undo a delete or a move.
    const dataStorageEntity = await this.lockStorage(command.projectId, command.id);
    const isLegacyStorage = dataStorageEntity.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY;
    const targetChanged = changesConnectionTarget(
      dataStorageEntity.type,
      dataStorageEntity.config,
      command.config
    );

    // Keys the schema drops are not stored, so a later save cannot use them unchecked.
    dataStorageEntity.config = storableStorageConfig(dataStorageEntity.type, command.config);

    if (!isLegacyStorage) {
      dataStorageEntity.title = command.title;
    }

    if (command.availableForUse !== undefined) {
      dataStorageEntity.availableForUse = command.availableForUse;
    }
    if (command.availableForMaintenance !== undefined) {
      dataStorageEntity.availableForMaintenance = command.availableForMaintenance;
    }

    const updatedDataStorageEntity = await this.dataStorageRepository.save(dataStorageEntity);

    if (command.contextIds !== undefined) {
      await this.contextAccessService.updateStorageContexts(
        updatedDataStorageEntity.id,
        command.projectId,
        command.contextIds,
        command.userId,
        command.roles
      );
    }

    await this.advancedSearchIndexSync?.scheduleReindex(
      SearchableEntityType.DATA_STORAGE,
      updatedDataStorageEntity.id,
      command.projectId
    );

    const { ownerIds } = command;
    if (ownerIds !== undefined) {
      await syncOwners(
        this.storageOwnerRepository,
        'storageId',
        updatedDataStorageEntity.id,
        updatedDataStorageEntity.projectId,
        ownerIds,
        this.idpProjectionsFacade,
        userId => {
          const o = new StorageOwner();
          o.storageId = updatedDataStorageEntity.id;
          o.userId = userId;
          return o;
        }
      );
    }

    // Re-checked under locks taken last, so they are held only until the commit.
    const member = { projectId: command.projectId, userId: command.userId, roles: command.roles };
    if (typeof command.reusableCredentialId === 'string') {
      await this.storageCredentials.bindStorage({
        ...member,
        storageId: dataStorageEntity.id,
        type: dataStorageEntity.type,
        credentialId: command.reusableCredentialId,
      });
    } else if (targetChanged) {
      // Also catches a Storage that was unbound at the first read and bound since.
      const current = await this.storageCredentials.lockBoundCredentialId(
        command.projectId,
        dataStorageEntity.id
      );
      if (current && current !== redirected) {
        await this.storageCredentials.assertCanUseCredential({
          ...member,
          credentialId: current,
        });
      }
    }
    return updatedDataStorageEntity;
  }

  /** On MySQL a locking read, so a delete or a rebind committed meanwhile is seen and waits. */
  private async lockStorage(projectId: string, id: string): Promise<DataStorage> {
    const isMysql = ['mysql', 'mariadb'].includes(
      String(this.dataStorageRepository.manager.connection.options.type)
    );
    const storage = await this.dataStorageRepository.findOne({
      where: { id, projectId },
      loadEagerRelations: false,
      ...(isMysql ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!storage) {
      throw new NotFoundException(
        `Data Storage with id ${id} and projectId ${projectId} not found`
      );
    }
    return storage;
  }

  private async buildResponse(
    entity: DataStorage,
    command: UpdateDataStorageCommand
  ): Promise<DataStorageDto> {
    // Reload to get fresh owners
    const fresh = await this.dataStorageService.getByProjectIdAndId(entity.projectId, entity.id);
    const summaries = await this.credentialsResolver.summarize(
      fresh.projectId,
      command.userId,
      command.roles,
      [fresh]
    );
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
      resolveOwnerUsers(fresh.ownerIds, userProjections),
      undefined,
      summaries.get(fresh.id) ?? null
    );
  }
}

// Legacy: the sentOldCredentialFields checks go with LegacyStorageCredentialReader.
/** Plugins first, then the shape of the request, before any lookup. */
function rejectCredentialFields(command: UpdateDataStorageCommand): void {
  if (command.reusableCredentialId === undefined) {
    if (command.sentOldCredentialFields) {
      throw new BadRequestException('This page is out of date. Reload it.');
    }
    return;
  }
  if (command.isPluginAuth) {
    throw new ForbiddenException("Plugins cannot change a Storage's Credential.");
  }
  if (command.reusableCredentialId === null) {
    throw new BadRequestException('reusableCredentialId cannot be null.');
  }
  if (command.sentOldCredentialFields) {
    throw new BadRequestException(
      'Send reusableCredentialId without credentials, credentialId or sourceStorageId.'
    );
  }
}

/** The validator's error for a config its Storage type's schema refuses. */
function assertConfigFits(type: DataStorageType, config: UpdateDataStorageCommand['config']): void {
  const invalid = invalidStorageConfig(type, config);
  if (invalid) throw new AccessValidationException(invalid.errorMessage!, invalid.reason);
}
