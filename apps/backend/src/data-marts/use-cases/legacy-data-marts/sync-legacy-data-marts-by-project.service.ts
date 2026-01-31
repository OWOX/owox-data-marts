import { Injectable } from '@nestjs/common';
import { DataMartDto } from '../../dto/domain/data-mart.dto';
import { SyncLegacyDataMartCommand } from '../../dto/domain/sync-legacy-data-mart.command';
import { SyncLegacyDataMartsByProjectCommand } from '../../dto/domain/sync-legacy-data-marts-by-project.command';
import { DataMartService } from '../../services/data-mart.service';
import { DataStorageService } from '../../services/data-storage.service';
import { LegacyDataMartsService } from '../../services/legacy-data-marts.service';
import { SyncLegacyDataMartService } from './sync-legacy-data-mart.service';

@Injectable()
export class SyncLegacyDataMartsByProjectService {
  constructor(
    private readonly legacyDataMartsService: LegacyDataMartsService,
    private readonly syncLegacyDataMartService: SyncLegacyDataMartService,
    private readonly dataStorageService: DataStorageService,
    private readonly dataMartService: DataMartService
  ) {}

  async run(command: SyncLegacyDataMartsByProjectCommand): Promise<DataMartDto[]> {
    const storage = await this.dataStorageService.getOrCreateLegacyStorage(
      command.projectId,
      command.gcpProjectId
    );

    await this.dataMartService.softDeleteByStorageIdAndProjectId(storage.id, command.projectId);

    const legacyDataMarts = await this.legacyDataMartsService.getDataMartsList(
      command.projectId,
      command.gcpProjectId
    );

    const results: DataMartDto[] = [];
    for (const legacyDataMart of legacyDataMarts) {
      const synced = await this.syncLegacyDataMartService.run(
        new SyncLegacyDataMartCommand(
          command.projectId,
          command.gcpProjectId,
          legacyDataMart.id,
          storage
        )
      );
      results.push(synced);
    }

    return results;
  }
}
