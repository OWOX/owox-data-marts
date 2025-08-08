import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { Repository } from 'typeorm';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { UpdateDataDestinationCommand } from '../dto/domain/update-data-destination.command';
import { DataDestinationService } from '../services/data-destination.service';
import { DataDestinationCredentialsValidatorFacade } from '../data-destination-types/facades/data-destination-credentials-validator.facade';
import { DataDestinationCredentialsProcessorFacade } from '../data-destination-types/facades/data-destination-credentials-processor.facade';
import { DataDestinationCredentials } from '../data-destination-types/data-destination-credentials.type';

@Injectable()
export class UpdateDataDestinationService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>,
    private readonly dataDestinationService: DataDestinationService,
    private readonly dataDestinationMapper: DataDestinationMapper,
    private readonly credentialsValidator: DataDestinationCredentialsValidatorFacade,
    private readonly credentialsProcessor: DataDestinationCredentialsProcessorFacade
  ) {}

  async run(command: UpdateDataDestinationCommand): Promise<DataDestinationDto> {
    const entity = await this.dataDestinationService.getByIdAndProjectId(
      command.id,
      command.projectId
    );

    const credentialsToCheck = command.hasCredentials() ? command.credentials : entity.credentials;

    await this.credentialsValidator.checkCredentials(
      entity.type,
      credentialsToCheck ?? ({} as DataDestinationCredentials)
    );

    if (command.hasCredentials()) {
      // Process credentials with existing data to preserve backend-managed fields
      entity.credentials = await this.credentialsProcessor.processCredentials(
        entity.type,
        command.credentials,
        entity.credentials // Pass existing credentials to preserve backend-managed fields
      );
    }

    entity.title = command.title;

    const updatedEntity = await this.dataDestinationRepository.save(entity);
    return this.dataDestinationMapper.toDomainDto(updatedEntity);
  }
}
