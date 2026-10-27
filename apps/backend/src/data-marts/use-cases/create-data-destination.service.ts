import {
  DataDestinationType,
  requiresCredentials,
} from '../data-destination-types/enums/data-destination-type.enum';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { DataDestination } from '../entities/data-destination.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { BadRequestException, Injectable } from '@nestjs/common';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationCreatedEvent } from '../events/data-destination-created.event';
import { DataDestinationCredentialsValidatorFacade } from '../data-destination-types/facades/data-destination-credentials-validator.facade';
import { DataDestinationCredentialsProcessorFacade } from '../data-destination-types/facades/data-destination-credentials-processor.facade';
import { GoogleSheetsFolderValidator } from '../data-destination-types/google-sheets/services/google-sheets-folder-validator.service';
import { DataDestinationCredentials } from '../data-destination-types/data-destination-credentials.type';
import {
  DestinationCredentialBindingService,
  type ResolvedDestinationCredential,
} from '../data-destination-types/destination-credential-binding.service';
import { DataDestinationCredentialsResolver } from '../data-destination-types/data-destination-credentials-resolver.service';
import { DataDestinationCredentialService } from '../services/data-destination-credential.service';
import {
  resolveDestinationCredentialType,
  extractDestinationIdentity,
} from '../services/credential-type-resolver';
import type { StoredDestinationCredentials } from '../entities/stored-destination-credentials.type';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { DestinationOwner } from '../entities/destination-owner.entity';
import { syncOwners } from '../utils/sync-owners';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { checkDestinationCredentialFields } from '../utils/destination-credential-fields';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';

const NO_CREDENTIAL_MESSAGES: Partial<Record<DataDestinationType, string>> = {
  [DataDestinationType.GOOGLE_SHEETS]:
    'reusableCredentialId is required for Google Sheets destinations.',
  [DataDestinationType.GOOGLE_CHAT]:
    'Google Chat destinations need reusableCredentialId or email credentials.',
};

@Injectable()
export class CreateDataDestinationService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly repository: Repository<DataDestination>,
    private readonly mapper: DataDestinationMapper,
    private readonly credentialsValidator: DataDestinationCredentialsValidatorFacade,
    private readonly credentialsProcessor: DataDestinationCredentialsProcessorFacade,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService,
    private readonly destinationCredentials: DestinationCredentialBindingService,
    private readonly credentialsResolver: DataDestinationCredentialsResolver,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    @InjectRepository(DestinationOwner)
    private readonly destinationOwnerRepository: Repository<DestinationOwner>,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly eventDispatcher: OwoxEventDispatcher,
    private readonly folderValidator: GoogleSheetsFolderValidator,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
  ) {}

  @Transactional()
  async run(command: CreateDataDestinationCommand): Promise<DataDestinationDto> {
    const credentials = checkDestinationCredentialFields(command.type, command);
    const { reusableCredentialId } = command;
    if (requiresCredentials(command.type) && !credentials && !reusableCredentialId) {
      throw new BadRequestException(
        NO_CREDENTIAL_MESSAGES[command.type] ?? 'Credentials are required.'
      );
    }

    // Checked without the Credential's lock, which the bind takes last to hold only until the commit.
    const candidate = reusableCredentialId
      ? await this.destinationCredentials.checkDestinationBinding({
          projectId: command.projectId,
          userId: command.userId,
          roles: command.roles,
          credentialId: reusableCredentialId,
          type: command.type,
        })
      : undefined;

    // A destination that holds no secret of its own gets no credential record.
    const credentialId = credentials ? await this.storeCredentials(command, credentials) : null;
    const savedEntity = await this.repository.save(
      this.repository.create({
        title: command.title,
        type: command.type,
        projectId: command.projectId,
        credentialId,
        createdById: command.userId,
        availableForUse: command.availableForUse ?? true,
        availableForMaintenance: false,
        config: command.config ?? null,
      })
    );

    return this.saveOwnersAndBuildResponse(savedEntity, command, candidate);
  }

  private async storeCredentials(
    command: CreateDataDestinationCommand,
    credentials: DataDestinationCredentials
  ): Promise<string> {
    await this.credentialsValidator.checkCredentials(command.type, credentials);

    // Process credentials before saving (generates backend-managed fields if needed)
    const processedCredentials = (await this.credentialsProcessor.processCredentials(
      command.type,
      credentials
    )) as StoredDestinationCredentials;
    const credentialType = resolveDestinationCredentialType(processedCredentials);
    const credentialRecord = await this.dataDestinationCredentialService.create({
      projectId: command.projectId,
      type: credentialType,
      credentials: processedCredentials,
      identity: extractDestinationIdentity(credentialType, processedCredentials),
    });
    return credentialRecord.id;
  }

  private async saveOwnersAndBuildResponse(
    savedEntity: DataDestination,
    command: CreateDataDestinationCommand,
    candidate: ResolvedDestinationCredential | undefined
  ): Promise<DataDestinationDto> {
    await this.advancedSearchIndexSync?.scheduleReindex(
      SearchableEntityType.DATA_DESTINATION,
      savedEntity.id,
      command.projectId
    );

    // Fail fast (and roll back) if a configured Drive folder is not usable for
    // service-account auto-creation.
    await this.folderValidator.validateConfiguredFolder(savedEntity, candidate);

    this.eventDispatcher.publishLocalOnCommit(
      new DataDestinationCreatedEvent(
        savedEntity.id,
        command.projectId,
        command.userId,
        savedEntity.type
      )
    );

    const ownerIdsToSave = command.ownerIds ?? [command.userId];
    await syncOwners(
      this.destinationOwnerRepository,
      'destinationId',
      savedEntity.id,
      command.projectId,
      ownerIdsToSave,
      this.idpProjectionsFacade,
      userId => {
        const o = new DestinationOwner();
        o.destinationId = savedEntity.id;
        o.userId = userId;
        return o;
      }
    );

    savedEntity.owners = ownerIdsToSave.map(uid => {
      const o = new DestinationOwner();
      o.destinationId = savedEntity.id;
      o.userId = uid;
      return o;
    });
    if (candidate) {
      await this.destinationCredentials.bindDestination({
        projectId: command.projectId,
        userId: command.userId,
        roles: command.roles,
        credentialId: candidate.credentialId,
        type: command.type,
        destinationId: savedEntity.id,
      });
    }
    const allUserIds = [command.userId, ...ownerIdsToSave];
    const userProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);
    const createdByUser = userProjections.getByUserId(command.userId) ?? null;
    const summaries = await this.credentialsResolver.summarize(
      command.projectId,
      command.userId,
      command.roles,
      [savedEntity]
    );
    return this.mapper.toDomainDto(
      savedEntity,
      createdByUser,
      resolveOwnerUsers(ownerIdsToSave, userProjections),
      summaries
    );
  }
}
