import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccessValidationException } from '../../../common/exceptions/access-validation.exception';
import { DataMartsDetailsOdmResponseDto } from '../../dto/domain/legacy-data-marts/data-mart-details-odm.response.dto';
import { SyncLegacyDataMartCommand } from '../../dto/domain/legacy-data-marts/sync-legacy-data-mart.command';
import { SqlDefinition } from '../../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { DataMartService } from '../../services/data-mart.service';
import { LegacyDataMartsService } from '../../services/legacy-data-marts/legacy-data-marts.service';
import { LegacyDataStorageService } from '../../services/legacy-data-marts/legacy-data-storage.service';
import { LegacySyncTriggersService } from '../../services/legacy-data-marts/legacy-sync-triggers.service';
import { DeleteLegacyDataMartService } from './delete-legacy-data-mart.service';

@Injectable()
export class SyncLegacyDataMartService {
  private readonly logger = new Logger(SyncLegacyDataMartService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly legacyDataMartsService: LegacyDataMartsService,
    private readonly legacyDataStorageService: LegacyDataStorageService,
    private readonly legacySyncTriggersService: LegacySyncTriggersService,
    private readonly deleteLegacyDataMartService: DeleteLegacyDataMartService
  ) {}

  async run(command: SyncLegacyDataMartCommand): Promise<void> {
    this.logger.debug(`Syncing legacy data mart ${command.dataMartId}`);

    try {
      let projection: DataMartsDetailsOdmResponseDto;
      try {
        projection = await this.legacyDataMartsService.getDataMartDetails(command.dataMartId);
      } catch (error) {
        if (error instanceof NotFoundException) {
          await this.deleteLegacyDataMartService.run({ id: command.dataMartId });
          return;
        }
        throw error;
      }

      const storage = await this.resolveStorage(projection, command);
      const dataMart = await this.getOrCreateDataMart(projection, storage);

      this.applyLegacyProjectionDetails(dataMart, projection);

      await this.dataMartService.save(dataMart);
    } catch (error) {
      if (error instanceof AccessValidationException) {
        this.logger.warn(
          `Access to legacy data mart ${command.dataMartId} denied: ${error.message}`
        );
        return;
      }
      throw error;
    }
  }

  private async resolveStorage(
    projection: DataMartsDetailsOdmResponseDto,
    command: SyncLegacyDataMartCommand
  ): Promise<DataStorage> {
    if (command.storage) {
      return command.storage;
    }

    const existingStorage = await this.legacyDataStorageService.findByGcpProjectId(
      projection.gcpProjectId
    );

    if (existingStorage) {
      if (existingStorage.projectId !== projection.projectId) {
        // projects mapping should be updated manually
        this.logger.error(
          `Storage for ${projection.gcpProjectId} is already linked to another project`
        );
      }
      return existingStorage;
    }

    const newStorage = await this.legacyDataStorageService.create(
      projection.projectId,
      projection.gcpProjectId
    );

    await this.legacySyncTriggersService.scheduleDataMartsSyncForStorageByGcp(
      projection.gcpProjectId
    );
    await this.legacySyncTriggersService.scheduleStoragesSyncForProject(projection.projectId);

    return newStorage;
  }

  private async getOrCreateDataMart(
    projection: DataMartsDetailsOdmResponseDto,
    storage: DataStorage
  ): Promise<DataMart> {
    const existing = await this.dataMartService.findById(projection.id, true);
    if (existing) {
      existing.deletedAt = undefined;
      return existing;
    }

    return this.dataMartService.create({
      id: projection.id,
      title: projection.title,
      description: projection.description ?? undefined,
      projectId: storage.projectId,
      storage,
      definitionType: DataMartDefinitionType.SQL,
      definition: {
        sqlQuery: projection.query,
      } as SqlDefinition,
      createdById: '',
    });
  }

  private applyLegacyProjectionDetails(
    dataMart: DataMart,
    projection: DataMartsDetailsOdmResponseDto
  ): void {
    dataMart.title = projection.title;
    dataMart.description = projection.description ?? undefined;
    dataMart.definition = { sqlQuery: projection.query } as SqlDefinition;
    dataMart.createdAt = projection.createdAt;
    dataMart.modifiedAt = projection.modifiedAt;
  }
}
