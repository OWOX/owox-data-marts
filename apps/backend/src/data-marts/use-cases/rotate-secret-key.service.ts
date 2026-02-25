import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { RotateSecretKeyCommand } from '../dto/domain/rotate-secret-key.command';
import { DataDestinationSecretKeyRotatorFacade } from '../data-destination-types/facades/data-destination-secret-key-rotator.facade';
import { DataDestinationCredentialService } from '../services/data-destination-credential.service';
import { DataDestinationCredentials } from '../data-destination-types/data-destination-credentials.type';

@Injectable()
export class RotateSecretKeyService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly repository: Repository<DataDestination>,
    private readonly mapper: DataDestinationMapper,
    private readonly secretKeyRotator: DataDestinationSecretKeyRotatorFacade,
    private readonly credentialService: DataDestinationCredentialService
  ) {}

  async run(command: RotateSecretKeyCommand): Promise<DataDestinationDto> {
    const entity = await this.repository.findOne({
      where: { id: command.id, projectId: command.projectId },
    });

    if (!entity) {
      throw new Error('Data destination not found');
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
      credentials: rotatedCredentials as Record<string, unknown>,
    });

    return this.mapper.toDomainDto(entity);
  }
}
