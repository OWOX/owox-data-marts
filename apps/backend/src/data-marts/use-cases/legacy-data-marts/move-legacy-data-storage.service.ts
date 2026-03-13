import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMartScheduledTrigger } from '../../entities/data-mart-scheduled-trigger.entity';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { Report } from '../../entities/report.entity';
import { LegacyDataStorageService } from '../../services/legacy-data-marts/legacy-data-storage.service';

@Injectable()
export class MoveLegacyDataStorageService {
  private readonly logger = new Logger(MoveLegacyDataStorageService.name);

  constructor(
    private readonly legacyDataStorageService: LegacyDataStorageService,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  async run(storage: DataStorage, newProjectId: string): Promise<DataStorage> {
    this.logger.log(
      `Moving storage ${storage.id} from project ${storage.projectId} to ${newProjectId}`
    );

    this.legacyDataStorageService.validateSyncPermissionForProject(newProjectId);

    const oldProjectId = storage.projectId;

    return await this.dataSource.transaction(async manager => {
      this.logger.log(
        `Performing bulk deletion of runs, triggers and reports for storage ${storage.id} in old project ${oldProjectId}`
      );

      const subQueryParams = { storageId: storage.id, oldProjectId };

      const dataMartSubQuery = manager
        .createQueryBuilder()
        .subQuery()
        .select('dm.id')
        .from(DataMart, 'dm')
        .where('dm.storageId = :storageId AND dm.projectId = :oldProjectId')
        .getQuery();

      const reportResult = await manager
        .createQueryBuilder()
        .delete()
        .from(Report)
        .where(`dataMartId IN ${dataMartSubQuery}`, subQueryParams)
        .execute();

      const triggerResult = await manager
        .createQueryBuilder()
        .delete()
        .from(DataMartScheduledTrigger)
        .where(`dataMartId IN ${dataMartSubQuery}`, subQueryParams)
        .execute();

      const runResult = await manager
        .createQueryBuilder()
        .delete()
        .from(DataMartRun)
        .where(`dataMartId IN ${dataMartSubQuery}`, subQueryParams)
        .execute();

      this.logger.log(
        `Deleted ${reportResult.affected ?? 0} reports, ${triggerResult.affected ?? 0} triggers, and ${runResult.affected ?? 0} runs.`
      );

      this.logger.log(
        `Performing bulk update of data marts for storage ${storage.id} to new project ${newProjectId}`
      );
      const dataMartResult = await manager
        .createQueryBuilder()
        .update(DataMart)
        .set({ projectId: newProjectId })
        .where('storageId = :storageId AND projectId = :oldProjectId', {
          storageId: storage.id,
          oldProjectId,
        })
        .execute();

      this.logger.log(`Updated ${dataMartResult.affected ?? 0} data marts.`);

      // Move storage and credentials to a new project
      storage.projectId = newProjectId;
      if (storage.credential) {
        storage.credential.projectId = newProjectId;
        storage.credential = await manager.save(storage.credential);
      }
      return await manager.save(storage);
    });
  }
}
