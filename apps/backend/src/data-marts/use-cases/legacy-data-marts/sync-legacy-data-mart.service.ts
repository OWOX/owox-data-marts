import { Injectable, NotFoundException } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { DataMartDto } from '../../dto/domain/data-mart.dto';
import { DataMartsDetailsOdmResponseDto } from '../../dto/domain/legacy-odm/data-mart-details-odm.response.dto';
import { SyncLegacyDataMartCommand } from '../../dto/domain/sync-legacy-data-mart.command';
import { SqlDefinition } from '../../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { DataMartMapper } from '../../mappers/data-mart.mapper';
import { DataMartService } from '../../services/data-mart.service';
import { DataStorageService } from '../../services/data-storage.service';
import { LegacyDataMartsService } from '../../services/legacy-data-marts.service';

const LEGACY_DATA_MART_CREATED_BY_ID = 'legacy-sync';

@Injectable()
export class SyncLegacyDataMartService {
  constructor(
    private readonly legacyDataMartsService: LegacyDataMartsService,
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper,
    private readonly dataStorageService: DataStorageService
  ) {}

  async run(command: SyncLegacyDataMartCommand): Promise<DataMartDto> {
    let details: DataMartsDetailsOdmResponseDto;
    try {
      details = await this.legacyDataMartsService.getDataMartDetails(
        command.projectId,
        command.dataMartId
      );
    } catch (error) {
      const softDeleted = await this.trySoftDeleteWhenMissing(command, error);
      if (softDeleted) {
        return softDeleted;
      }
      throw error;
    }

    this.ensureLegacyProjectMatches(details, command);

    const storage = await this.resolveStorage(command);
    const dataMart = await this.getOrCreateDataMart(details, command, storage);

    this.applyLegacyDetails(dataMart, details);

    await this.dataMartService.save(dataMart);

    return this.mapper.toDomainDto(dataMart);
  }

  private async trySoftDeleteWhenMissing(
    command: SyncLegacyDataMartCommand,
    error: unknown
  ): Promise<DataMartDto | null> {
    if (!(error instanceof BusinessViolationException && error.errorDetails?.status === 404)) {
      return null;
    }

    try {
      const existingDataMart = await this.dataMartService.getByIdAndProjectId(
        command.dataMartId,
        command.projectId,
        true
      );
      if (!existingDataMart.deletedAt) {
        await this.dataMartService.softDeleteByIdAndProjectId(
          existingDataMart.id,
          command.projectId
        );
      }
      return this.mapper.toDomainDto(existingDataMart);
    } catch (innerError) {
      if (innerError instanceof NotFoundException) {
        return null;
      }
      throw innerError;
    }
  }

  private ensureLegacyProjectMatches(
    details: DataMartsDetailsOdmResponseDto,
    command: SyncLegacyDataMartCommand
  ): void {
    if (!details.gcpProjectId || details.gcpProjectId !== command.gcpProjectId) {
      throw new BusinessViolationException(
        'Legacy data mart gcpProjectId does not match requested gcpProjectId.'
      );
    }
  }

  private async resolveStorage(command: SyncLegacyDataMartCommand): Promise<DataStorage> {
    if (command.storage) {
      return command.storage;
    }

    return this.dataStorageService.getOrCreateLegacyStorage(
      command.projectId,
      command.gcpProjectId
    );
  }

  private async getOrCreateDataMart(
    details: DataMartsDetailsOdmResponseDto,
    command: SyncLegacyDataMartCommand,
    storage: DataStorage
  ): Promise<DataMart> {
    try {
      const existing = await this.dataMartService.getByIdAndProjectId(
        details.id,
        command.projectId,
        true
      );
      if (existing.deletedAt) {
        existing.deletedAt = undefined;
      }
      return existing;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
    }

    return this.dataMartService.create({
      id: details.id,
      title: details.title,
      description: details.description ?? undefined,
      projectId: command.projectId,
      createdById: LEGACY_DATA_MART_CREATED_BY_ID,
      storage,
      definitionType: DataMartDefinitionType.SQL,
      definition: {
        sqlQuery: details.query,
      } as SqlDefinition,
    });
  }

  private applyLegacyDetails(dataMart: DataMart, details: DataMartsDetailsOdmResponseDto): void {
    dataMart.title = details.title;
    dataMart.description = details.description ?? undefined;
    dataMart.definition = { sqlQuery: details.query } as SqlDefinition;
  }
}
