import { Injectable } from '@nestjs/common';
import { processBatches } from '../../../common/utils/batch-processor';
import { DeleteDataMartCommand } from '../../dto/domain/delete-data-mart.command';
import { SyncLegacyDataMartCommand } from '../../dto/domain/legacy-data-marts/sync-legacy-data-mart.command';
import { SyncLegacyDataMartsByGcpProjectCommand } from '../../dto/domain/legacy-data-marts/sync-legacy-data-marts-by-gcp-project.command';
import { DataMartService } from '../../services/data-mart.service';
import { LegacyDataMartsService } from '../../services/legacy-data-marts/legacy-data-marts.service';
import { LegacyDataStorageService } from '../../services/legacy-data-marts/legacy-data-storage.service';
import { DeleteDataMartService } from '../delete-data-mart.service';
import { SyncLegacyDataMartService } from './sync-legacy-data-mart.service';

@Injectable()
export class SyncLegacyDataMartsByGcpService {
  constructor(
    private readonly legacyDataMartsService: LegacyDataMartsService,
    private readonly syncLegacyDataMartService: SyncLegacyDataMartService,
    private readonly legacyDataStorageService: LegacyDataStorageService,
    private readonly dataMartService: DataMartService,
    private readonly deleteDataMartService: DeleteDataMartService
  ) {}

  async run(command: SyncLegacyDataMartsByGcpProjectCommand): Promise<number> {
    const storage = await this.legacyDataStorageService.findByGcpProjectId(command.gcpProjectId);

    if (!storage) {
      throw new Error(`Legacy storage not found for GCP '${command.gcpProjectId}'`);
    }

    const existingDataMarts = await this.dataMartService.findIdsByStorage(storage);
    const legacyDataMartIds = await this.legacyDataMartsService.getDataMartsList(
      command.gcpProjectId
    );
    const legacyDataMartIdsSet = new Set(legacyDataMartIds);

    await processBatches(legacyDataMartIds, legacyDataMartId =>
      this.syncLegacyDataMartService.run(new SyncLegacyDataMartCommand(legacyDataMartId, storage))
    );

    const dataMartsToDelete = existingDataMarts.filter(id => !legacyDataMartIdsSet.has(id));

    await processBatches(dataMartsToDelete, id =>
      this.deleteDataMartService.run(new DeleteDataMartCommand(id, storage.projectId, true))
    );

    return legacyDataMartIds.length;
  }
}
