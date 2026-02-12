import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BigQueryConfig } from '../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { DataStorageCredentials } from '../data-storage-types/data-storage-credentials.type';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageAccessFacade } from '../data-storage-types/facades/data-storage-access.facade';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { UpdateDataStorageCommand } from '../dto/domain/update-data-storage.command';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageService } from '../services/data-storage.service';

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

    const credentialsToCheck = command.hasCredentials()
      ? command.credentials
      : dataStorageEntity.credentials;

    const isLegacyStorage = dataStorageEntity.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY;
    if (isLegacyStorage && command.hasConfig()) {
      (command.config as BigQueryConfig).projectId = (
        dataStorageEntity.config as BigQueryConfig
      ).projectId;
    }

    await this.dataStorageAccessFacade.checkAccess(
      dataStorageEntity.type,
      command.config,
      credentialsToCheck ?? ({} as DataStorageCredentials)
    );

    if (command.hasCredentials()) {
      dataStorageEntity.credentials = command.credentials;
    }

    dataStorageEntity.config = command.config;

    if (!isLegacyStorage) {
      dataStorageEntity.title = command.title;
    }

    const updatedDataStorageEntity = await this.dataStorageRepository.save(dataStorageEntity);
    return this.dataStorageMapper.toDomainDto(updatedDataStorageEntity);
  }
}
