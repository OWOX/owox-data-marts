import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';

@Injectable()
export class DataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>
  ) {}

  async getByProjectIdAndId(projectId: string, id: string): Promise<DataStorage> {
    const entity = await this.dataStorageRepository.findOne({
      where: { id, projectId },
    });

    if (!entity) {
      throw new NotFoundException(`DataStorage with id ${id} and projectId ${projectId} not found`);
    }

    return entity;
  }
}
