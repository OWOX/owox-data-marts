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
    private readonly copyCredentialService: CopyCredentialService
  ) {}

  @Transactional()
  async run(command: UpdateDataDestinationCommand): Promise<DataDestinationDto> {
    const entity = await this.dataDestinationService.getByIdAndProjectId(
      command.id,
      command.projectId
    );

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
      if (newCredId) {
        entity.credentialId = newCredId;
      }

      // After copy, save title and return — skip credential validation/processing
      entity.title = command.title;
      const updatedEntity = await this.dataDestinationRepository.save(entity);
      return this.dataDestinationMapper.toDomainDto(updatedEntity);
    }

    // Handle OAuth credentialId disconnect (null = revoke)
    if (command.credentialId === null && entity.credentialId) {
      await this.dataDestinationCredentialService.softDelete(entity.credentialId);
      entity.credentialId = null;
      // Clear the eagerly-loaded relation so TypeORM save() does not
      // overwrite credentialId with the stale (soft-deleted) relation id.
      entity.credential = null;
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
    } else if (command.hasCredentials()) {
      // Service account credentials — validate, process, and store
      // Non-null assertion safe: guarded by hasCredentials() above
      const credentials = command.credentials!;
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

    const updatedEntity = await this.dataDestinationRepository.save(entity);
    return this.dataDestinationMapper.toDomainDto(updatedEntity);
  }
}
