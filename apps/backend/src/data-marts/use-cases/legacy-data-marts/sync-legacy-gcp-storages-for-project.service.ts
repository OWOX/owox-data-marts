import { Injectable, Logger } from '@nestjs/common';
import { SyncLegacyGcpStoragesForProjectCommand } from '../../dto/domain/legacy-data-marts/sync-legacy-gcp-storages-for-project.command';
import { LegacyDataMartsService } from '../../services/legacy-data-marts/legacy-data-marts.service';
import { LegacyDataStorageService } from '../../services/legacy-data-marts/legacy-data-storage.service';
import { LegacySyncTriggersService } from '../../services/legacy-data-marts/legacy-sync-triggers.service';

@Injectable()
export class SyncLegacyGcpStoragesForProjectService {
  private readonly logger = new Logger(SyncLegacyGcpStoragesForProjectService.name);

  constructor(
    private readonly legacyDataMartsService: LegacyDataMartsService,
    private readonly legacyDataStorageService: LegacyDataStorageService,
    private readonly legacySyncTriggersService: LegacySyncTriggersService
  ) {}

  async run(command: SyncLegacyGcpStoragesForProjectCommand): Promise<number> {
    this.logger.log(`Syncing legacy GCP storages for project ${command.projectId}`);

    const relatedGcpProjects = await this.legacyDataMartsService.getGcpProjectsList(
      command.projectId
    );
    this.logger.log(`Found ${relatedGcpProjects.length} GCP projects for ${command.projectId}`);

    for (const gcpProjectId of relatedGcpProjects) {
      const existingStorage = await this.legacyDataStorageService.findByGcpProjectId(gcpProjectId);
      if (existingStorage) {
        if (existingStorage.projectId !== command.projectId) {
          this.logger.error(
            `GCP ${gcpProjectId} already linked to project ${existingStorage.projectId}, skipping`
          );
        } else {
          this.logger.log(
            `GCP ${gcpProjectId} already linked to project ${command.projectId}, skipping`
          );
        }
        continue;
      }

      await this.legacyDataStorageService.create(command.projectId, gcpProjectId);
      await this.legacySyncTriggersService.scheduleDataMartsSyncForStorageByGcp(gcpProjectId);

      this.logger.log(`GCP ${gcpProjectId} linked to project ${command.projectId}`);
    }

    return relatedGcpProjects.length;
  }
}
