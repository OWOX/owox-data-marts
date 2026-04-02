import { AvailableDestinationTypesService } from '../data-destination-types/available-destination-types.service';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { DataDestination } from '../entities/data-destination.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationCredentialsValidatorFacade } from '../data-destination-types/facades/data-destination-credentials-validator.facade';
import { DataDestinationCredentialsProcessorFacade } from '../data-destination-types/facades/data-destination-credentials-processor.facade';
import { DataDestinationCredentialService } from '../services/data-destination-credential.service';
import { GoogleOAuthClientService } from '../services/google-oauth/google-oauth-client.service';
import {
  resolveDestinationCredentialType,
  extractDestinationIdentity,
} from '../services/credential-type-resolver';
import type { StoredDestinationCredentials } from '../entities/stored-destination-credentials.type';
import { DataDestinationService } from '../services/data-destination.service';
import { CopyCredentialService } from '../services/copy-credential.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { DestinationOwner } from '../entities/destination-owner.entity';
import { syncOwners } from '../utils/sync-owners';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

@Injectable()
export class CreateDataDestinationService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly repository: Repository<DataDestination>,
    private readonly mapper: DataDestinationMapper,
    private readonly credentialsValidator: DataDestinationCredentialsValidatorFacade,
    private readonly credentialsProcessor: DataDestinationCredentialsProcessorFacade,
    private readonly availableDestinationTypesService: AvailableDestinationTypesService,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService,
    private readonly googleOAuthClientService: GoogleOAuthClientService,
    private readonly dataDestinationService: DataDestinationService,
    private readonly copyCredentialService: CopyCredentialService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    @InjectRepository(DestinationOwner)
    private readonly destinationOwnerRepository: Repository<DestinationOwner>,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {}

  @Transactional()
  async run(command: CreateDataDestinationCommand): Promise<DataDestinationDto> {
    this.availableDestinationTypesService.verifyIsAllowed(command.type);

    // Mutual exclusion: sourceDestinationId vs credentials/credentialId
    if (command.sourceDestinationId && command.hasCredentials()) {
      throw new BadRequestException(
        'Cannot provide both sourceDestinationId and credentials in the same request'
      );
    }
    if (command.sourceDestinationId && command.credentialId) {
      throw new BadRequestException('Cannot provide both sourceDestinationId and credentialId');
    }

    // Copy credentials from another destination
    if (command.sourceDestinationId) {
      const source = await this.dataDestinationService.getByIdAndProjectId(
        command.sourceDestinationId,
        command.projectId
      );
      if (!source.credentialId || !source.credential) {
        throw new BadRequestException('Source destination has no credentials to copy');
      }
      if (source.type !== command.type) {
        throw new BadRequestException(
          `Cannot copy credentials from ${source.type} to ${command.type} destination`
        );
      }

      const newCredId = await this.copyCredentialService.copyDestinationCredential(
        command.projectId,
        null,
        source.credential
      );

      const entity = this.repository.create({
        title: command.title,
        type: command.type,
        projectId: command.projectId,
        credentialId: newCredId,
        createdById: command.userId,
      });

      const savedEntity = await this.repository.save(entity);

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
      const allUserIds = [command.userId, ...ownerIdsToSave];
      const userProjections =
        await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);
      const createdByUser = userProjections.getByUserId(command.userId) ?? null;
      return this.mapper.toDomainDto(
        savedEntity,
        createdByUser,
        resolveOwnerUsers(ownerIdsToSave, userProjections)
      );
    }

    // If a pre-created OAuth credential ID is provided, validate it by getting a fresh access token
    if (command.credentialId) {
      const oauth2Client =
        await this.googleOAuthClientService.getDestinationOAuth2ClientByCredentialId(
          command.credentialId
        );
      await oauth2Client.getAccessToken();

      const entity = this.repository.create({
        title: command.title,
        type: command.type,
        projectId: command.projectId,
        credentialId: command.credentialId,
        createdById: command.userId,
      });

      const savedEntity = await this.repository.save(entity);

      const oauthOwnerIdsToSave = command.ownerIds ?? [command.userId];
      await syncOwners(
        this.destinationOwnerRepository,
        'destinationId',
        savedEntity.id,
        command.projectId,
        oauthOwnerIdsToSave,
        this.idpProjectionsFacade,
        userId => {
          const o = new DestinationOwner();
          o.destinationId = savedEntity.id;
          o.userId = userId;
          return o;
        }
      );

      savedEntity.owners = oauthOwnerIdsToSave.map(uid => {
        const o = new DestinationOwner();
        o.destinationId = savedEntity.id;
        o.userId = uid;
        return o;
      });
      const oauthAllUserIds = [command.userId, ...oauthOwnerIdsToSave];
      const oauthUserProjections =
        await this.userProjectionsFetcherService.fetchUserProjectionsList(oauthAllUserIds);
      const oauthCreatedByUser = oauthUserProjections.getByUserId(command.userId) ?? null;
      return this.mapper.toDomainDto(
        savedEntity,
        oauthCreatedByUser,
        resolveOwnerUsers(oauthOwnerIdsToSave, oauthUserProjections)
      );
    }

    if (!command.credentials) {
      throw new BadRequestException('Credentials are required when not copying from a source');
    }

    await this.credentialsValidator.checkCredentials(command.type, command.credentials);

    // Process credentials before saving (generates backend-managed fields if needed)
    const processedCredentials = await this.credentialsProcessor.processCredentials(
      command.type,
      command.credentials
    );

    // Create credential record in the new table
    const credentialType = resolveDestinationCredentialType(
      processedCredentials as StoredDestinationCredentials
    );
    const identity = extractDestinationIdentity(
      credentialType,
      processedCredentials as StoredDestinationCredentials
    );

    const credentialRecord = await this.dataDestinationCredentialService.create({
      projectId: command.projectId,
      type: credentialType,
      credentials: processedCredentials as StoredDestinationCredentials,
      identity,
    });

    const entity = this.repository.create({
      title: command.title,
      type: command.type,
      projectId: command.projectId,
      credentialId: credentialRecord.id,
      createdById: command.userId,
    });

    const savedEntity = await this.repository.save(entity);

    const credOwnerIdsToSave = command.ownerIds ?? [command.userId];
    await syncOwners(
      this.destinationOwnerRepository,
      'destinationId',
      savedEntity.id,
      command.projectId,
      credOwnerIdsToSave,
      this.idpProjectionsFacade,
      userId => {
        const o = new DestinationOwner();
        o.destinationId = savedEntity.id;
        o.userId = userId;
        return o;
      }
    );

    savedEntity.owners = credOwnerIdsToSave.map(uid => {
      const o = new DestinationOwner();
      o.destinationId = savedEntity.id;
      o.userId = uid;
      return o;
    });
    const credAllUserIds = [command.userId, ...credOwnerIdsToSave];
    const credUserProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(credAllUserIds);
    const credCreatedByUser = credUserProjections.getByUserId(command.userId) ?? null;
    return this.mapper.toDomainDto(
      savedEntity,
      credCreatedByUser,
      resolveOwnerUsers(credOwnerIdsToSave, credUserProjections)
    );
  }
}
