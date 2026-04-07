import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { BigQueryConfig } from '../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { CreateDataMartCommand } from '../dto/domain/create-data-mart.command';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { SqlDefinition } from '../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { DataMartTechnicalOwner } from '../entities/data-mart-technical-owner.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

const LEGACY_DATA_MART_INITIAL_QUERY = 'SELECT 1';

@Injectable()
export class CreateDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataStorageService: DataStorageService,
    private readonly mapper: DataMartMapper,
    private readonly legacyDataMartService: LegacyDataMartsService,
    @InjectRepository(DataMartTechnicalOwner)
    private readonly technicalOwnerRepository: Repository<DataMartTechnicalOwner>,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: CreateDataMartCommand): Promise<DataMartDto> {
    // Stage 3: verify user has USE access to the chosen Storage
    if (command.roles.length > 0) {
      const canUseStorage = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        command.storageId,
        Action.USE,
        command.projectId
      );
      if (!canUseStorage) {
        throw new ForbiddenException(
          'You do not have access to use this Storage for creating a DataMart'
        );
      }
    }

    const dataStorage = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.storageId
    );

    let legacyDataMartId: string | undefined = undefined;
    const isLegacyDataMart = dataStorage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY;
    if (isLegacyDataMart) {
      const newLegacyDataMart = await this.legacyDataMartService.createDataMart({
        title: command.title,
        gcpProjectId: (dataStorage.config as BigQueryConfig).projectId,
        query: LEGACY_DATA_MART_INITIAL_QUERY,
      });
      legacyDataMartId = newLegacyDataMart.id;
    }

    const dataMart = this.dataMartService.create({
      title: command.title,
      projectId: command.projectId,
      createdById: command.userId,
      storage: dataStorage,
      sharedForReporting: false,
      sharedForMaintenance: false,
      ...(isLegacyDataMart
        ? {
            id: legacyDataMartId,
            definitionType: DataMartDefinitionType.SQL,
            definition: { sqlQuery: LEGACY_DATA_MART_INITIAL_QUERY } as SqlDefinition,
          }
        : {}),
    });

    const newDataMart = await this.dataMartService.save(dataMart);

    const technicalOwner = new DataMartTechnicalOwner();
    technicalOwner.dataMartId = newDataMart.id;
    technicalOwner.userId = command.userId;
    await this.technicalOwnerRepository.save(technicalOwner);

    newDataMart.technicalOwners = [technicalOwner];
    newDataMart.businessOwners = [];

    return this.mapper.toDomainDto(newDataMart);
  }
}
