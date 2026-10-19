import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorage } from '../entities/data-storage.entity';

@Injectable()
export class DataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>
  ) {}

  async listSetupMetadata(
    projectId: string
  ): Promise<
    Array<{ id: string; title?: string | null; type: DataStorageType; projectId: string }>
  > {
    return this.dataStorageRepository.find({
      where: { projectId },
      select: ['id', 'title', 'type', 'projectId'],
      loadEagerRelations: false,
      order: { id: 'ASC' },
    });
  }

  async getByProjectIdAndId(projectId: string, id: string): Promise<DataStorage> {
    const entity = await this.dataStorageRepository.findOne({
      where: { id, projectId },
      relations: ['owners', 'contexts', 'contexts.context'],
    });

    if (!entity) {
      throw new NotFoundException(
        `Data Storage with id ${id} and projectId ${projectId} not found`
      );
    }

    return entity;
  }
}
