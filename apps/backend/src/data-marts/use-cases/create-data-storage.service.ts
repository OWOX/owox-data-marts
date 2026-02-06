import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { CreateDataStorageCommand } from '../dto/domain/create-data-storage.command';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageMapper } from '../mappers/data-storage.mapper';

@Injectable()
export class CreateDataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    private readonly dataStorageMapper: DataStorageMapper
  ) {}

  async run(command: CreateDataStorageCommand): Promise<DataStorageDto> {
    if (command.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      throw new BusinessViolationException(
        "Legacy Google BigQuery storage can't be created manually."
      );
    }

    const entity = this.dataStorageRepository.create({
      type: command.type,
      projectId: command.projectId,
    });

    const savedEntity = await this.dataStorageRepository.save(entity);
    return this.dataStorageMapper.toDomainDto(savedEntity);
  }
}
