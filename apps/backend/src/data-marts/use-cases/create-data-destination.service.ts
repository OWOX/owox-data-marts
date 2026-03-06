import { AvailableDestinationTypesService } from '../data-destination-types/available-destination-types.service';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import { Repository } from 'typeorm';
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
    private readonly copyCredentialService: CopyCredentialService
  ) {}

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
      });

      const savedEntity = await this.repository.save(entity);
      return this.mapper.toDomainDto(savedEntity);
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
      });

      const savedEntity = await this.repository.save(entity);
      return this.mapper.toDomainDto(savedEntity);
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
    });

    const savedEntity = await this.repository.save(entity);
    return this.mapper.toDomainDto(savedEntity);
  }
}
