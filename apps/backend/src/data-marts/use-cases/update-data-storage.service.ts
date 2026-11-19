import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import {
  BigQueryConfig,
  BigQueryConfigSchema,
} from '../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { DataStorageConfig } from '../data-storage-types/data-storage-config.type';
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
import {
  StorageCredentialBindingService,
  type ResolvedStorageCredential,
} from '../data-storage-types/storage-credential-binding.service';
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
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { ManagedStorageService } from '../owox-storage/managed-storage.service';

interface StorageUpdateValidation {
  type: DataStorageType;
  config: DataStorageConfig;
  previousConfig: DataStorage['config'];
  legacyCredentialId: string | null;
  boundCredentialId: string | null | undefined;
}

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
    private readonly managedStorages: ManagedStorageService,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
  ) {}

  async run(command: UpdateDataStorageCommand): Promise<DataStorageDto> {
    rejectCredentialFields(command);
    const storage = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.id
    );
    await this.assertPermissions(command);
    // Token refreshes and lost-grant marks must survive a failed validation or save.
    const validation = await this.validate(command, storage);
    const { storage: saved, configWasEmpty } = await this.save(command, validation);
    if (configWasEmpty && saved.config) {
      await this.eventDispatcher.publishExternal(
        new StorageConfigSetEvent(saved.id, saved.projectId, saved.createdById ?? '')
      );
    }
    return this.buildResponse(saved, command);
  }

  private async assertPermissions(command: UpdateDataStorageCommand): Promise<void> {
    const actions = new Map<Action, string>();
    if (
      command.title !== undefined ||
      command.config !== undefined ||
      command.reusableCredentialId !== undefined
    ) {
      actions.set(Action.EDIT, 'You do not have permission to edit this Storage.');
    }
    if (command.ownerIds !== undefined) {
      actions.set(
        Action.MANAGE_OWNERS,
        'You do not have permission to manage owners of this Storage.'
      );
    }
    if (
      command.contextIds !== undefined ||
      command.availableForUse !== undefined ||
      command.availableForMaintenance !== undefined
    ) {
      actions.set(
        Action.CONFIGURE_SHARING,
        'You do not have permission to configure sharing for this Storage.'
      );
    }
    if (actions.size === 0) throw new BadRequestException('Supply at least one Storage field.');
    for (const [action, message] of actions) {
      const allowed = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        command.id,
        action,
        command.projectId
      );
      if (!allowed) throw new ForbiddenException(message);
    }
  }

  private async validate(
    command: UpdateDataStorageCommand,
    storage: DataStorage
  ): Promise<StorageUpdateValidation | undefined> {
    if (command.config === undefined && command.reusableCredentialId === undefined)
      return undefined;
    const managed = await this.managedStorages.findByStorageId(storage.id);
    if (
      managed &&
      (command.reusableCredentialId !== undefined ||
        (command.config !== undefined &&
          !sameStorageConfig(storage.type, storage.config, command.config)))
    ) {
      throw new BusinessViolationException(
        "An OWOX Storage's connection and Credential are managed by OWOX and cannot be changed."
      );
    }
    // The config is unchanged, so there is nothing to verify or write.
    if (managed) return undefined;
    let config = command.config ?? storage.config;
    if (!config) {
      throw new BadRequestException('Set the Storage configuration before selecting a Credential.');
    }
    if (storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY && command.config !== undefined) {
      config = {
        ...config,
        projectId: (storage.config as BigQueryConfig | undefined)?.projectId,
      } as BigQueryConfig;
    }
    if (command.isPluginAuth && changesConnectionTarget(storage.type, storage.config, config)) {
      throw new ForbiddenException("Plugins cannot change where a Storage's key is sent.");
    }

    if (
      storage.type === DataStorageType.GOOGLE_BIGQUERY ||
      storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY
    ) {
      const parsed = BigQueryConfigSchema.safeParse(config);
      if (!parsed.success) {
        // Keep the HTTP form's field errors when the full access check is skipped.
        const invalid = ValidationResult.invalidInput('config', parsed.error);
        throw new BadRequestException({
          message: invalid.errorMessage,
          error: 'Bad Request',
          errorDetails: invalid.reason,
        });
      }
    } else if (
      typeof command.reusableCredentialId === 'string' ||
      !sameStorageConfig(storage.type, storage.config, config)
    ) {
      assertConfigFits(storage.type, config);
    }

    const bound =
      command.reusableCredentialId === undefined
        ? await this.storageCredentials.resolveForStorage(storage)
        : undefined;
    const validation: StorageUpdateValidation = {
      type: storage.type,
      config,
      previousConfig: storage.config,
      legacyCredentialId: storage.credentialId ?? null,
      boundCredentialId:
        bound === undefined || sameStorageConfig(storage.type, storage.config, config)
          ? undefined
          : (bound?.credentialId ?? null),
    };
    await this.verifyCredential(command, storage, config, bound);
    return validation;
  }

  private async verifyCredential(
    command: UpdateDataStorageCommand,
    storage: DataStorage,
    config: DataStorageConfig,
    bound: ResolvedStorageCredential | null | undefined
  ): Promise<void> {
    const member = { projectId: command.projectId, userId: command.userId, roles: command.roles };
    if (typeof command.reusableCredentialId === 'string') {
      const candidate = await this.storageCredentials.checkStorageBinding({
        ...member,
        credentialId: command.reusableCredentialId,
        type: storage.type,
      });
      await this.dataStorageAccessFacade.verifyAccess(
        storage.type,
        config,
        await this.credentialsResolver.resolveCredential(storage, candidate)
      );
      return;
    }
    if (!bound) {
      // Legacy: no access check on the old key, as before the conversion.
      if (this.legacy.hasOldKey(storage)) return;
      await this.dataStorageAccessFacade.verifyAccess(
        storage.type,
        config,
        {} as DataStorageCredentials
      );
      return;
    }
    if (sameStorageConfig(storage.type, storage.config, config)) return;
    if (changesConnectionTarget(storage.type, storage.config, config)) {
      await this.storageCredentials.assertCanUseCredential({
        ...member,
        credentialId: bound.credentialId,
      });
    }
    let credentials: DataStorageCredentials;
    try {
      credentials = await this.credentialsResolver.resolveCredential(storage, bound);
    } catch (error) {
      if (!(error instanceof StorageCredentialUnavailableException)) throw error;
      // An unavailable Credential must not block a valid configuration update.
      return;
    }
    await this.dataStorageAccessFacade.verifyAccess(storage.type, config, credentials);
  }

  @Transactional()
  private async save(command: UpdateDataStorageCommand, validation?: StorageUpdateValidation) {
    const dataStorageEntity = await this.lockStorage(command.projectId, command.id);
    await this.assertPermissions(command);
    if (validation) {
      if (
        validation.type !== dataStorageEntity.type ||
        !sameStorageConfig(
          dataStorageEntity.type,
          validation.previousConfig,
          dataStorageEntity.config
        )
      ) {
        throw new ConflictException(
          'The Storage connection changed during validation. Read it again before retrying.'
        );
      }
      if (validation.boundCredentialId !== undefined) {
        const current = await this.storageCredentials.lockBoundCredentialId(
          command.projectId,
          command.id
        );
        if (
          current !== validation.boundCredentialId ||
          (current === null &&
            (dataStorageEntity.credentialId ?? null) !== validation.legacyCredentialId)
        ) {
          throw new ConflictException(
            'The Storage Credential changed during validation. Read it again before retrying.'
          );
        }
      }
    }
    const configWasEmpty = !dataStorageEntity.config;
    const isLegacyStorage = dataStorageEntity.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY;
    const targetChanged =
      command.config !== undefined &&
      changesConnectionTarget(dataStorageEntity.type, dataStorageEntity.config, validation?.config);

    if (command.config !== undefined && validation) {
      dataStorageEntity.config = storableStorageConfig(dataStorageEntity.type, validation.config);
    }

    if (!isLegacyStorage && command.title !== undefined) {
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

    const member = { projectId: command.projectId, userId: command.userId, roles: command.roles };
    if (typeof command.reusableCredentialId === 'string') {
      await this.storageCredentials.bindStorage({
        ...member,
        storageId: dataStorageEntity.id,
        type: dataStorageEntity.type,
        credentialId: command.reusableCredentialId,
      });
    } else if (targetChanged && validation?.boundCredentialId) {
      await this.storageCredentials.assertCanUseCredential({
        ...member,
        credentialId: validation.boundCredentialId,
      });
    }
    return { storage: updatedDataStorageEntity, configWasEmpty };
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
