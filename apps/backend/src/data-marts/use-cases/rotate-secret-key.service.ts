import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { RotateSecretKeyCommand } from '../dto/domain/rotate-secret-key.command';
import { DataDestinationSecretKeyRotatorFacade } from '../data-destination-types/facades/data-destination-secret-key-rotator.facade';
import { DataDestinationCredentialService } from '../services/data-destination-credential.service';
import { DataDestinationCredentials } from '../data-destination-types/data-destination-credentials.type';
import type { StoredDestinationCredentials } from '../entities/stored-destination-credentials.type';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class RotateSecretKeyService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly repository: Repository<DataDestination>,
    private readonly mapper: DataDestinationMapper,
    private readonly secretKeyRotator: DataDestinationSecretKeyRotatorFacade,
    private readonly credentialService: DataDestinationCredentialService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: RotateSecretKeyCommand): Promise<DataDestinationDto> {
    const entity = await this.repository.findOne({
      where: { id: command.id, projectId: command.projectId },
    });

    if (!entity) {
      throw new Error('Data destination not found');
    }

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
        throw new ForbiddenException(
          'You do not have permission to rotate credentials for this Destination'
        );
      }
    }

    if (!entity.credentialId) {
      throw new Error('Data destination credentials are not configured');
    }

    const credential = await this.credentialService.getById(entity.credentialId);
    if (!credential) {
      throw new Error('Credential record not found');
    }

    const rotatedCredentials = await this.secretKeyRotator.rotateSecretKey(
      entity.type,
      credential.credentials as DataDestinationCredentials
    );

    await this.credentialService.update(entity.credentialId, {
      credentials: rotatedCredentials as StoredDestinationCredentials,
    });

    return this.mapper.toDomainDto(entity);
  }
}
