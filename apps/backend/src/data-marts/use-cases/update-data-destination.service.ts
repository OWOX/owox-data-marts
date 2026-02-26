import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
    private readonly googleOAuthClientService: GoogleOAuthClientService
  ) {}

  async run(command: UpdateDataDestinationCommand): Promise<DataDestinationDto> {
    const entity = await this.dataDestinationService.getByIdAndProjectId(
      command.id,
      command.projectId
    );

    this.availableDestinationTypesService.verifyIsAllowed(entity.type);

    // Handle OAuth credentialId disconnect (null = revoke)
    if (command.credentialId === null && entity.credentialId) {
      await this.dataDestinationCredentialService.softDelete(entity.credentialId);
      entity.credentialId = null;
    }

    if (command.hasCredentials()) {
      if (command.credentialId) {
        // New OAuth credential provided — validate by getting a fresh access token
        const oauth2Client =
          await this.googleOAuthClientService.getDestinationOAuth2ClientByCredentialId(
            command.credentialId
          );
        await oauth2Client.getAccessToken();
      } else {
        const credentialsToCheck = command.credentials;
        await this.credentialsValidator.checkCredentials(
          entity.type,
          credentialsToCheck ?? ({} as DataDestinationCredentials)
        );
      }

      // Process credentials with existing data to preserve backend-managed fields
      let existingCredentials: DataDestinationCredentials | undefined;
      if (entity.credentialId) {
        const existingCredential = await this.dataDestinationCredentialService.getById(
          entity.credentialId
        );
        existingCredentials = existingCredential?.credentials as
          | DataDestinationCredentials
          | undefined;
      }
      const processedCredentials = await this.credentialsProcessor.processCredentials(
        entity.type,
        command.credentials,
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
      }
    } else if (!command.hasCredentials() && entity.credentialId) {
      const existingCredential = await this.dataDestinationCredentialService.getById(
        entity.credentialId
      );
      if (existingCredential?.type === DestinationCredentialType.GOOGLE_OAUTH) {
        const oauth2Client =
          await this.googleOAuthClientService.getDestinationOAuth2ClientByCredentialId(
            entity.credentialId
          );
        await oauth2Client.getAccessToken();
      }
    }

    entity.title = command.title;

    const updatedEntity = await this.dataDestinationRepository.save(entity);
    return this.dataDestinationMapper.toDomainDto(updatedEntity);
  }
}
