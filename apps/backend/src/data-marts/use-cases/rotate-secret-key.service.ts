import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { RotateSecretKeyCommand } from '../dto/domain/rotate-secret-key.command';
import { DataDestinationSecretKeyRotatorFacade } from '../data-destination-types/facades/data-destination-secret-key-rotator.facade';

@Injectable()
export class RotateSecretKeyService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly repository: Repository<DataDestination>,
    private readonly mapper: DataDestinationMapper,
    private readonly secretKeyRotator: DataDestinationSecretKeyRotatorFacade
  ) {}

  async run(command: RotateSecretKeyCommand): Promise<DataDestinationDto> {
    const entity = await this.repository.findOne({
      where: { id: command.id, projectId: command.projectId },
    });

    if (!entity) {
      throw new Error('Data destination not found');
    }

    const rotatedCredentials = await this.secretKeyRotator.rotateSecretKey(
      entity.type,
      entity.credentials!
    );

    entity.credentials = rotatedCredentials;
    const savedEntity = await this.repository.save(entity);

    return this.mapper.toDomainDto(savedEntity);
  }
}
