import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { ListDataStoragesCommand } from '../dto/domain/list-data-storages.command';

@Injectable()
export class ListDataStoragesService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepo: Repository<DataStorage>,
    private readonly mapper: DataStorageMapper
  ) {}

  async run(command: ListDataStoragesCommand): Promise<DataStorageDto[]> {
    const dataStorages = await this.dataStorageRepo.find({
      where: { projectId: command.projectId },
    });
    return this.mapper.toDomainDtoList(dataStorages);
  }
}
