import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationCredentialsValidatorFacade } from '../data-destination-types/facades/data-destination-credentials-validator.facade';
import { DataDestinationCredentialsProcessorFacade } from '../data-destination-types/facades/data-destination-credentials-processor.facade';

@Injectable()
export class CreateDataDestinationService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly repository: Repository<DataDestination>,
    private readonly mapper: DataDestinationMapper,
    private readonly credentialsValidator: DataDestinationCredentialsValidatorFacade,
    private readonly credentialsProcessor: DataDestinationCredentialsProcessorFacade
  ) {}

  async run(command: CreateDataDestinationCommand): Promise<DataDestinationDto> {
    await this.credentialsValidator.checkCredentials(command.type, command.credentials);

    // Process credentials before saving (generates backend-managed fields if needed)
    const processedCredentials = await this.credentialsProcessor.processCredentials(
      command.type,
      command.credentials
    );

    const entity = this.repository.create({
      title: command.title,
      type: command.type,
      projectId: command.projectId,
      credentials: processedCredentials,
    });

    const savedEntity = await this.repository.save(entity);
    return this.mapper.toDomainDto(savedEntity);
  }
}
