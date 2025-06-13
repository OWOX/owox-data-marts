import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageType } from '../enums/data-storage-type.enum';

@Injectable()
export class DataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>
  ) {}

  async findOrCreateByType(type: DataStorageType): Promise<DataStorage> {
    let storage = await this.dataStorageRepository.findOne({
      where: { type },
    });

    if (!storage) {
      storage = this.dataStorageRepository.create({ type });
      storage = await this.dataStorageRepository.save(storage);
    }

    return storage;
  }

  async getByIdAndProjectId(projectId: string, id: string): Promise<DataStorage> {
    const entity = await this.dataStorageRepository.findOne({ where: { id, projectId } });

    if (!entity) {
      throw new NotFoundException(`DataStorage with id ${id} and projectId ${projectId} not found`);
    }

    return entity;
  }
}
