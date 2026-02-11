import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v5 as uuidv5 } from 'uuid';
import { AccessValidationException } from '../../../common/exceptions/access-validation.exception';
import {
  BIGQUERY_AUTODETECT_LOCATION,
  BigQueryConfig,
} from '../../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { DataStorage } from '../../entities/data-storage.entity';

export const LEGACY_DATA_STORAGE_ID_NAMESPACE = 'c6b09b4f-6fa4-4e6e-bb1a-4bfe94e50b7f';

@Injectable()
export class LegacyDataStorageService {
  private readonly logger = new Logger(LegacyDataStorageService.name);
  private readonly whitelistProjects: Set<string> | null;

  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    private readonly configService: ConfigService
  ) {
    const whitelistEnv = this.configService.get<string>('LEGACY_DATA_MARTS_WHITELIST_PROJECTS');

    if (whitelistEnv) {
      this.whitelistProjects = new Set(
        whitelistEnv
          .split(',')
          .map(p => p.trim())
          .filter(Boolean)
      );
      this.logger.log(
        `Legacy data storage whitelist enabled with ${this.whitelistProjects.size} projects`
      );
    } else {
      // Whitelist isn't configured - allow all projects (graceful degradation)
      this.whitelistProjects = null;
      this.logger.log('Legacy data storage whitelist is not configured, all projects allowed');
    }
  }

  async findByGcpProjectId(gcpProjectId: string): Promise<DataStorage | null> {
    const storageId = uuidv5(gcpProjectId, LEGACY_DATA_STORAGE_ID_NAMESPACE);
    return await this.dataStorageRepository.findOne({ where: { id: storageId } });
  }

  async create(projectId: string, gcpProjectId: string): Promise<DataStorage> {
    this.validateSyncPermissionForProject(projectId);

    const storageId = uuidv5(gcpProjectId, LEGACY_DATA_STORAGE_ID_NAMESPACE);

    this.logger.log(`Creating legacy data storage for gcpProjectId ${gcpProjectId}`);

    const newStorage = this.dataStorageRepository.create({
      id: storageId,
      type: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      projectId,
      title: gcpProjectId,
      config: {
        projectId: gcpProjectId,
        location: BIGQUERY_AUTODETECT_LOCATION,
      } as BigQueryConfig,
    });

    return await this.dataStorageRepository.save(newStorage);
  }

  /**
   * Validates whether the given project ID has permission to synchronize with legacy data storage.
   * Throws an exception if the project is not in the whitelist.
   *
   * @param {string} projectId - The unique identifier of the project to validate.
   * @return {void} This method does not return any value.
   */
  private validateSyncPermissionForProject(projectId: string): void {
    if (this.whitelistProjects === null) {
      return;
    }

    if (!this.whitelistProjects.has(projectId)) {
      this.logger.warn(`Project ${projectId} is not in the legacy data storage whitelist`);
      throw new AccessValidationException(
        `Project ${projectId} is not allowed to use legacy data marts features`
      );
    }
  }
}
