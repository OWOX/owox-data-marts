import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Transactional } from 'typeorm-transactional';
import { AvailableDestinationTypesService } from '../data-destination-types/available-destination-types.service';
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
import { DataDestinationCredentialService } from '../services/data-destination-credential.service';
import { GoogleOAuthClientService } from '../services/google-oauth/google-oauth-client.service';
import {
  resolveDestinationCredentialType,
  extractDestinationIdentity,
} from '../services/credential-type-resolver';
import type { StoredDestinationCredentials } from '../entities/stored-destination-credentials.type';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import { CopyCredentialService } from '../services/copy-credential.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { DestinationOwner } from '../entities/destination-owner.entity';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { syncOwners } from '../utils/sync-owners';
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
    private readonly availableDestinationTypesService: AvailableDestinationTypesService,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService,
    private readonly googleOAuthClientService: GoogleOAuthClientService,
    private readonly copyCredentialService: CopyCredentialService,
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
        throw new ForbiddenException('You cannot manage owners of this Destination');
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
        throw new ForbiddenException('You cannot configure sharing for this Destination');
      }
    }

    const entity = await this.dataDestinationService.getByIdAndProjectId(
      command.id,
      command.projectId
    );

    // Only re-validate the Drive folder (a live Drive API round-trip inside the
    // transaction) when the configured folder actually changes. Updates that
    // leave the folder untouched — e.g. toggling availability or renaming the
    // destination — skip the network call. Computed before `entity.config` is
    // mutated below so it reflects the previously persisted folder.
    const existingFolderId = entity.config?.folderId?.trim() || undefined;
    const incomingFolderId =
      command.config !== undefined
        ? command.config?.folderId?.trim() || undefined
        : existingFolderId;
    const folderChanged = incomingFolderId !== existingFolderId;

    // Folder validation depends on the EFFECTIVE credential, not only the folder
    // id: replacing/copying credentials or switching credential type while
    // keeping the same folder must re-validate (a new service account may not be
    // able to write there). Set when a branch below actually mutates credential
    // data; the validator itself no-ops for non-Service-Account credentials, so
    // OAuth credential changes do not incur a Drive round-trip.
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

    this.availableDestinationTypesService.verifyIsAllowed(entity.type);

    // Mutual exclusion: sourceDestinationId vs credentials
    if (command.sourceDestinationId && command.hasCredentials()) {
      throw new BadRequestException(
        'Cannot provide both sourceDestinationId and credentials in the same request'
      );
    }

    if (command.sourceDestinationId && command.credentialId) {
      throw new BadRequestException('Cannot provide both sourceDestinationId and credentialId');
    }

    if (command.sourceDestinationId === command.id) {
      throw new BadRequestException('Cannot copy credentials from a destination to itself');
    }

    if (command.sourceDestinationId) {
      // Permissions Model: copy credentials requires COPY_CREDENTIALS access to source destination
      if (command.userId) {
        const canCopy = await this.accessDecisionService.canAccess(
          command.userId,
          command.roles,
          EntityType.DESTINATION,
          command.sourceDestinationId,
          Action.COPY_CREDENTIALS,
          command.projectId
        );
        if (!canCopy) {
          throw new ForbiddenException(
            'You do not have permission to copy credentials from this destination'
          );
        }
      }

      const source = await this.dataDestinationService.getByIdAndProjectId(
        command.sourceDestinationId,
        command.projectId
      );
      if (!source.credentialId || !source.credential) {
        throw new BadRequestException('Source destination has no credentials to copy');
      }
      if (source.type !== entity.type) {
        throw new BadRequestException(
          `Cannot copy credentials from ${source.type} to ${entity.type} destination`
        );
      }

      const newCredId = await this.copyCredentialService.copyDestinationCredential(
        command.projectId,
        entity.credentialId ?? null,
        source.credential
      );
      // Credential content was replaced (even when copied in place into the same
      // credential id), so the configured folder must be re-validated below.
      credentialChanged = true;
      if (newCredId) {
        entity.credentialId = newCredId;
        entity.credential = null;
      }

      // After copy, save title and return — skip credential validation/processing
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
      return this.replaceOwnersAndBuildResponse(
        updatedEntity,
        command.ownerIds,
        folderChanged || credentialChanged
      );
    }

    // Handle OAuth credentialId disconnect (null = revoke)
    if (command.credentialId === null && entity.credentialId) {
      await this.dataDestinationCredentialService.softDelete(entity.credentialId);
      entity.credentialId = null;
      // Clear the eagerly-loaded relation so TypeORM save() does not
      // overwrite credentialId with the stale (soft-deleted) relation id.
      entity.credential = null;
      // Clear the Drive folder config too: an OAuth-picked folder's drive.file
      // grant was tied to the now-disconnected account, so it would be stale.
      // Mirrors the standalone revoke path. An explicit command.config (handled
      // below) still wins.
      entity.config = null;
    }

    if (command.credentialId) {
      // OAuth credential provided — validate ownership, verify token, and link
      const credential = await this.dataDestinationCredentialService.getById(command.credentialId);
      if (!credential || credential.projectId !== command.projectId) {
        throw new ForbiddenException('Credential does not belong to this project');
      }
      const oauth2Client =
        await this.googleOAuthClientService.getDestinationOAuth2ClientByCredentialId(
          command.credentialId
        );
      try {
        await oauth2Client.getAccessToken();
      } catch {
        throw new BadRequestException('OAuth token verification failed. Please re-authenticate.');
      }
      entity.credentialId = command.credentialId;
      entity.credential = null;
      credentialChanged = true;
    } else if (command.hasCredentials()) {
      // Service account credentials — validate, process, and store
      // Non-null assertion safe: guarded by hasCredentials() above
      const credentials = command.credentials!;
      credentialChanged = true;
      await this.credentialsValidator.checkCredentials(entity.type, credentials);

      // Process credentials with existing data to preserve backend-managed fields
      let existingCredentials: DataDestinationCredentials | undefined;
      if (entity.credential) {
        existingCredentials = entity.credential.credentials as
          | DataDestinationCredentials
          | undefined;
      }
      const processedCredentials = await this.credentialsProcessor.processCredentials(
        entity.type,
        credentials,
        existingCredentials
      );

      // Update or create credential record in the new table
      const credentialType = resolveDestinationCredentialType(
        processedCredentials as StoredDestinationCredentials
      );
      const identity = extractDestinationIdentity(
        credentialType,
        processedCredentials as StoredDestinationCredentials
      );

      if (entity.credentialId) {
        await this.dataDestinationCredentialService.update(entity.credentialId, {
          type: credentialType,
          credentials: processedCredentials as StoredDestinationCredentials,
          identity,
        });
      } else {
        const newCredential = await this.dataDestinationCredentialService.create({
          projectId: command.projectId,
          type: credentialType,
          credentials: processedCredentials as StoredDestinationCredentials,
          identity,
        });
        entity.credentialId = newCredential.id;
        entity.credential = null;
      }
    } else if (!command.hasCredentials() && entity.credential) {
      if (entity.credential.type === DestinationCredentialType.GOOGLE_OAUTH) {
        const oauth2Client =
          await this.googleOAuthClientService.getDestinationOAuth2ClientByCredentialId(
            entity.credential.id
          );
        try {
          await oauth2Client.getAccessToken();
        } catch {
          throw new BadRequestException('OAuth token verification failed. Please re-authenticate.');
        }
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

    return this.replaceOwnersAndBuildResponse(
      updatedEntity,
      command.ownerIds,
      folderChanged || credentialChanged
    );
  }

  private async replaceOwnersAndBuildResponse(
    entity: DataDestination,
    ownerIds?: string[],
    folderChanged = true
  ): Promise<DataDestinationDto> {
    // Fail fast (and roll back) if a newly configured Drive folder is not usable
    // for service-account auto-creation. Skipped when the folder did not change,
    // to avoid a redundant live Drive API call on unrelated updates.
    if (folderChanged) {
      await this.folderValidator.validateConfiguredFolder(entity);
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
    return this.dataDestinationMapper.toDomainDto(
      fresh,
      createdByUser,
      resolveOwnerUsers(fresh.ownerIds, userProjections)
    );
  }
}
