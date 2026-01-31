import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v5 as uuidv5 } from 'uuid';
import {
  BIGQUERY_AUTODETECT_LOCATION,
  BigQueryConfig,
} from '../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorage } from '../entities/data-storage.entity';

const LEGACY_DATA_STORAGE_ID_NAMESPACE = 'c6b09b4f-6fa4-4e6e-bb1a-4bfe94e50b7f';

@Injectable()
export class DataStorageService {
  private readonly logger = new Logger(DataStorageService.name);

  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>
  ) {}

  async getByIdAndProjectId(projectId: string, id: string): Promise<DataStorage> {
    const entity = await this.dataStorageRepository.findOne({ where: { id, projectId } });

    if (!entity) {
      throw new NotFoundException(`DataStorage with id ${id} and projectId ${projectId} not found`);
    }

    return entity;
  }

  async getOrCreateLegacyStorage(projectId: string, gcpProjectId: string): Promise<DataStorage> {
    const storageId = uuidv5(gcpProjectId, LEGACY_DATA_STORAGE_ID_NAMESPACE);
    const existingStorage = await this.dataStorageRepository.findOne({ where: { id: storageId } });

    if (existingStorage) {
      if (existingStorage.projectId !== projectId) {
        throw new Error(
          `Legacy data storage for ${gcpProjectId} already exists for project ${existingStorage.projectId} and can't be used for project ${projectId}`
        );
      }
      return existingStorage;
    }

    this.logger.log(`Creating legacy data storage for gcpProjectId ${gcpProjectId}`);

    const newStorage = this.dataStorageRepository.create({
      id: storageId,
      type: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      projectId,
      config: {
        projectId: gcpProjectId,
        location: BIGQUERY_AUTODETECT_LOCATION,
      } as BigQueryConfig,
    });

    return await this.dataStorageRepository.save(newStorage);
  }
}
