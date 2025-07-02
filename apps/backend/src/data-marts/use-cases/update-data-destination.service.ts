import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { Repository } from 'typeorm';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { UpdateDataDestinationCommand } from '../dto/domain/update-data-destination.command';
import { DataDestinationService } from '../services/data-destination.service';
import { DataDestinationCredentialsValidatorFacade } from '../data-destination-types/facades/data-destination-credentials-validator.facade';

@Injectable()
export class UpdateDataDestinationService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>,
    private readonly dataDestinationService: DataDestinationService,
    private readonly dataDestinationMapper: DataDestinationMapper,
    private readonly credentialsValidator: DataDestinationCredentialsValidatorFacade
  ) {}

  async run(command: UpdateDataDestinationCommand): Promise<DataDestinationDto> {
    const entity = await this.dataDestinationService.getByIdAndProjectId(
      command.id,
      command.projectId
    );

    await this.credentialsValidator.checkCredentials(entity.type, command.credentials);

    entity.title = command.title;
    entity.credentials = command.credentials;

    const updatedEntity = await this.dataDestinationRepository.save(entity);
    return this.dataDestinationMapper.toDomainDto(updatedEntity);
  }
}
