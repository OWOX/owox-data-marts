import { Injectable } from '@nestjs/common';
import { BigQueryConfig } from '../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { CreateDataMartCommand } from '../dto/domain/create-data-mart.command';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { SqlDefinition } from '../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';

const LEGACY_DATA_MART_INITIAL_QUERY = 'SELECT 1';

@Injectable()
export class CreateDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataStorageService: DataStorageService,
    private readonly mapper: DataMartMapper,
    private readonly legacyDataMartService: LegacyDataMartsService
  ) {}

  async run(command: CreateDataMartCommand): Promise<DataMartDto> {
    const dataStorage = await this.dataStorageService.getByIdAndProjectId(
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
      ...(isLegacyDataMart
        ? {
            id: legacyDataMartId,
            definitionType: DataMartDefinitionType.SQL,
            definition: { sqlQuery: LEGACY_DATA_MART_INITIAL_QUERY } as SqlDefinition,
          }
        : {}),
    });

    const newDataMart = await this.dataMartService.save(dataMart);

    return this.mapper.toDomainDto(newDataMart);
  }
}
