import { CreateDataStorageCommand } from '../dto/domain/create-data-storage.command';
import { Repository } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataStorageMapper } from '../mappers/data-storage.mapper';

@Injectable()
export class CreateDataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    private readonly dataStorageMapper: DataStorageMapper
  ) {}

  async run(projectId: string, command: CreateDataStorageCommand): Promise<DataStorageDto> {
    const entity = this.dataStorageRepository.create({
      type: command.type,
      projectId,
    });

    const savedEntity = await this.dataStorageRepository.save(entity);
    return this.dataStorageMapper.toDomainDto(savedEntity);
  }
}
