import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { Repository } from 'typeorm';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { UpdateDataStorageCommand } from '../dto/domain/update-data-storage.command';
import { DataStorageService } from '../services/data-storage.service';
import { DataStorageAccessFacade } from '../data-storage-types/facades/data-storage-access.facade';
import { DataStorageCredentials } from '../data-storage-types/data-storage-credentials.type';

@Injectable()
export class UpdateDataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    private readonly dataStorageService: DataStorageService,
    private readonly dataStorageMapper: DataStorageMapper,
    private readonly dataStorageAccessFacade: DataStorageAccessFacade
  ) {}

  async run(command: UpdateDataStorageCommand): Promise<DataStorageDto> {
    const dataStorageEntity = await this.dataStorageService.getByIdAndProjectId(
      command.projectId,
      command.id
    );

    const credentialsToCheck = command.hasCredentialsUpdate()
      ? command.credentials
      : dataStorageEntity.credentials;

    await this.dataStorageAccessFacade.checkAccess(
      dataStorageEntity.type,
      command.config,
      credentialsToCheck ?? ({} as DataStorageCredentials)
    );

    if (command.hasCredentialsUpdate()) {
      dataStorageEntity.credentials = command.credentials;
    }

    dataStorageEntity.config = command.config;
    dataStorageEntity.title = command.title;

    const updatedDataStorageEntity = await this.dataStorageRepository.save(dataStorageEntity);
    return this.dataStorageMapper.toDomainDto(updatedDataStorageEntity);
  }
}
