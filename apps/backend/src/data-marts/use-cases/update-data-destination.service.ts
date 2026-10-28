import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Transactional } from 'typeorm-transactional';
import { DataDestination } from '../entities/data-destination.entity';
import { Repository } from 'typeorm';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { UpdateDataDestinationCommand } from '../dto/domain/update-data-destination.command';
import { DataDestinationService } from '../services/data-destination.service';
import { DataDestinationCredentialsValidatorFacade } from '../data-destination-types/facades/data-destination-credentials-validator.facade';
import { DataDestinationCredentialsProcessorFacade } from '../data-destination-types/facades/data-destination-credentials-processor.facade';
import { GoogleSheetsFolderValidator } from '../data-destination-types/google-sheets/services/google-sheets-folder-validator.service';
import { DataDestinationCredentials } from '../data-destination-types/data-destination-credentials.type';
import {
  DestinationCredentialBindingService,
  type ResolvedDestinationCredential,
} from '../data-destination-types/destination-credential-binding.service';
import {
  definitionIdOfRow,
  driveAccountOf,
  identityOf,
} from '../data-destination-types/destination-public-credentials';
import { DataDestinationCredentialsResolver } from '../data-destination-types/data-destination-credentials-resolver.service';
import { DataDestinationCredentialService } from '../services/data-destination-credential.service';
import {
  resolveDestinationCredentialType,
  extractDestinationIdentity,
} from '../services/credential-type-resolver';
import type { StoredDestinationCredentials } from '../entities/stored-destination-credentials.type';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { DestinationOwner } from '../entities/destination-owner.entity';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { syncOwners } from '../utils/sync-owners';
import {
  checkDestinationCredentialFields,
  PLUGIN_CREDENTIAL_CHANGE_MESSAGE,
} from '../utils/destination-credential-fields';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { ContextAccessService } from '../services/context/context-access.service';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';

@Injectable()
export class UpdateDataDestinationService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>,
    private readonly dataDestinationService: DataDestinationService,
    private readonly dataDestinationMapper: DataDestinationMapper,
    private readonly credentialsValidator: DataDestinationCredentialsValidatorFacade,
    private readonly credentialsProcessor: DataDestinationCredentialsProcessorFacade,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService,
    private readonly destinationCredentials: DestinationCredentialBindingService,
    private readonly credentialsResolver: DataDestinationCredentialsResolver,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    @InjectRepository(DestinationOwner)
    private readonly destinationOwnerRepository: Repository<DestinationOwner>,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly contextAccessService: ContextAccessService,
    private readonly folderValidator: GoogleSheetsFolderValidator,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
  ) {}

  @Transactional()
  async run(command: UpdateDataDestinationCommand): Promise<DataDestinationDto> {
    // Locked before any other read: on MySQL a plain read first would pin an older snapshot.
    const { entity, lockedConfig } = await this.lockDestination(command.projectId, command.id);

    // Permissions Model: if ownerIds are being changed, check MANAGE_OWNERS permission
    if (command.ownerIds !== undefined && command.userId) {
      const canManage = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DESTINATION,
        command.id,
        Action.MANAGE_OWNERS,
        command.projectId
      );
      if (!canManage) {
        throw new ForbiddenException(
          'You do not have permission to manage owners of this Destination. You must be an owner of this Destination, or a Project Admin.'
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
        EntityType.DESTINATION,
        command.id,
        Action.CONFIGURE_SHARING,
        command.projectId
      );
      if (!canConfigure) {
        throw new ForbiddenException(
          'You do not have permission to configure sharing for this Destination. You must be an owner of this Destination, or a Project Admin.'
        );
      }
    }

    const titleChanged = entity.title !== command.title;

    // Only re-validate the Drive folder (a live Drive API round-trip inside the
    // transaction) when the configured folder actually changes. Updates that
    // leave the folder untouched — e.g. toggling availability or renaming the
    // destination — skip the network call. Computed before `entity.config` is
    // mutated below so it reflects the previously persisted folder.
    const existingFolderId = lockedConfig?.folderId?.trim() || undefined;
    const incomingFolderId =
      command.config !== undefined
        ? command.config?.folderId?.trim() || undefined
        : existingFolderId;
    const folderChanged = incomingFolderId !== existingFolderId;

    // A new service account may not be able to write to the same folder.
    let credentialChanged = false;

    // Permissions Model: verify user has EDIT access to this Destination
    if (command.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DESTINATION,
        command.id,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to edit this Destination');
      }
    }

    const credentials = checkDestinationCredentialFields(entity.type, command);

    let candidate: ResolvedDestinationCredential | undefined;
    // A folder the save sends stays and is checked below; one it leaves out goes with the account that picked it.
    let clearFolder = false;
    if (
      command.reusableCredentialId &&
      command.reusableCredentialId !==
        (await this.destinationCredentials.boundCredentialIdOfDestination(
          command.projectId,
          entity.id
        ))
    ) {
      // Checked without the Credential's lock, which the bind takes last to hold only until the commit.
      candidate = await this.destinationCredentials.checkDestinationBinding({
        projectId: command.projectId,
        userId: command.userId,
        roles: command.roles,
        credentialId: command.reusableCredentialId,
        type: entity.type,
      });
      credentialChanged = true;
      clearFolder =
        command.config === undefined &&
        !!existingFolderId &&
        (await this.changesDriveAccount(entity, candidate));
      // Google Chat by email kept its recipients on its own row; webhook delivery replaces them.
      if (entity.credential?.type === DestinationCredentialType.EMAIL) {
        await this.dataDestinationCredentialService.softDelete(entity.credential.id);
        entity.credentialId = null;
        // Cleared so save() does not write the stale relation's id back.
        entity.credential = null;
      }
    } else if (credentials) {
      credentialChanged = true;
      if (entity.type === DataDestinationType.GOOGLE_CHAT) {
        // Email recipients replace a webhook, bound or on its old row, which a plugin cannot choose.
        if (
          command.isPluginCall &&
          (entity.credential?.type === DestinationCredentialType.GOOGLE_CHAT_WEBHOOK ||
            (
              await this.destinationCredentials.findBoundDestinationIds(command.projectId, [
                entity.id,
              ])
            ).size > 0)
        ) {
          throw new ForbiddenException(PLUGIN_CREDENTIAL_CHANGE_MESSAGE);
        }
        await this.destinationCredentials.deactivateDestination(entity.id);
      }
      await this.credentialsValidator.checkCredentials(entity.type, credentials);

      // Process credentials with existing data to preserve backend-managed fields
      const processedCredentials = (await this.credentialsProcessor.processCredentials(
        entity.type,
        credentials,
        entity.credential?.credentials as DataDestinationCredentials | undefined
      )) as StoredDestinationCredentials;
      const credentialType = resolveDestinationCredentialType(processedCredentials);
      const identity = extractDestinationIdentity(credentialType, processedCredentials);

      if (entity.credentialId) {
        await this.dataDestinationCredentialService.update(entity.credentialId, {
          type: credentialType,
          credentials: processedCredentials,
          identity,
        });
      } else {
        const newCredential = await this.dataDestinationCredentialService.create({
          projectId: command.projectId,
          type: credentialType,
          credentials: processedCredentials,
          identity,
        });
        entity.credentialId = newCredential.id;
        entity.credential = null;
      }
    }

    entity.title = command.title;

    if (command.availableForUse !== undefined) {
      entity.availableForUse = command.availableForUse;
    }
    if (command.availableForMaintenance !== undefined) {
      entity.availableForMaintenance = command.availableForMaintenance;
    }
    if (command.config !== undefined) {
      entity.config = command.config;
    }
    if (clearFolder) {
      entity.config = null;
    }

    const updatedEntity = await this.dataDestinationRepository.save(entity);

    if (command.contextIds !== undefined) {
      await this.contextAccessService.updateDestinationContexts(
        updatedEntity.id,
        command.projectId,
        command.contextIds,
        command.userId,
        command.roles
      );
    }

    await this.advancedSearchIndexSync?.scheduleReindex(
      SearchableEntityType.DATA_DESTINATION,
      updatedEntity.id,
      command.projectId
    );
    if (titleChanged) {
      await this.advancedSearchIndexSync?.scheduleReportsReindex(
        SearchableEntityType.DATA_DESTINATION,
        entity.id,
        command.projectId
      );
    }

    return this.replaceOwnersAndBuildResponse(
      updatedEntity,
      command,
      folderChanged || credentialChanged,
      candidate
    );
  }

  /**
   * On MySQL a locking read first, so a delete committed meanwhile is seen and one started now waits.
   * `lockedConfig` is the stored folder as that read saw it, which a plain read in an older snapshot may not.
   */
  private async lockDestination(
    projectId: string,
    id: string
  ): Promise<{ entity: DataDestination; lockedConfig: DataDestination['config'] }> {
    const isMysql = ['mysql', 'mariadb'].includes(
      String(this.dataDestinationRepository.manager.connection.options.type)
    );
    const locked = isMysql
      ? await this.dataDestinationRepository.findOne({
          where: { id, projectId },
          loadEagerRelations: false,
          lock: { mode: 'pessimistic_write' },
        })
      : null;
    if (isMysql && !locked) {
      throw new NotFoundException(
        `Data Destination with id ${id} and projectId ${projectId} not found`
      );
    }
    const entity = await this.dataDestinationService.getByIdAndProjectId(id, projectId);
    return { entity, lockedConfig: locked ? locked.config : entity.config };
  }

  /** Whether the candidate signs in as another account than the Destination used; unknown counts as no. */
  private async changesDriveAccount(
    entity: DataDestination,
    candidate: ResolvedDestinationCredential
  ): Promise<boolean> {
    // Read under the Destination lock, so a save that waited compares with what the first one bound.
    const bound = await this.destinationCredentials.lockedPublicOfDestination(
      entity.projectId,
      entity.id
    );
    const row = entity.credential;
    const before =
      bound === undefined
        ? row && driveAccountOf(definitionIdOfRow(row.type), row.identity?.email)
        : bound && driveAccountOf(bound.definitionId, identityOf(bound.publicMetadata));
    const after = driveAccountOf(candidate.definitionId, identityOf(candidate.publicMetadata));
    return !!before && !!after && before !== after;
  }

  private async replaceOwnersAndBuildResponse(
    entity: DataDestination,
    command: UpdateDataDestinationCommand,
    folderChanged: boolean,
    candidate: ResolvedDestinationCredential | undefined
  ): Promise<DataDestinationDto> {
    const { ownerIds } = command;
    // Fail fast (and roll back) if a newly configured Drive folder is not usable
    // for service-account auto-creation. Skipped when the folder did not change,
    // to avoid a redundant live Drive API call on unrelated updates.
    if (folderChanged) {
      await this.folderValidator.validateConfiguredFolder(entity, candidate);
    }

    if (ownerIds !== undefined) {
      await syncOwners(
        this.destinationOwnerRepository,
        'destinationId',
        entity.id,
        entity.projectId,
        ownerIds,
        this.idpProjectionsFacade,
        userId => {
          const o = new DestinationOwner();
          o.destinationId = entity.id;
          o.userId = userId;
          return o;
        }
      );
    }

    if (candidate) {
      await this.destinationCredentials.bindDestination({
        projectId: command.projectId,
        userId: command.userId,
        roles: command.roles,
        credentialId: candidate.credentialId,
        type: entity.type,
        destinationId: entity.id,
      });
    }

    // Reload to get fresh owners
    const fresh = await this.dataDestinationService.getByIdAndProjectId(
      entity.id,
      entity.projectId
    );
    const allUserIds = [...(fresh.createdById ? [fresh.createdById] : []), ...fresh.ownerIds];
    const userProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);
    const createdByUser = fresh.createdById
      ? (userProjections.getByUserId(fresh.createdById) ?? null)
      : null;
    const summaries = await this.credentialsResolver.summarize(
      fresh.projectId,
      command.userId,
      command.roles,
      [fresh]
    );
    return this.dataDestinationMapper.toDomainDto(
      fresh,
      createdByUser,
      resolveOwnerUsers(fresh.ownerIds, userProjections),
      summaries
    );
  }
}
