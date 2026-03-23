import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMartScheduledTrigger } from '../../entities/data-mart-scheduled-trigger.entity';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorageCredential } from '../../entities/data-storage-credential.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { Report } from '../../entities/report.entity';
import { ConnectorRunTrigger } from '../../entities/connector-run-trigger.entity';
import { ReportRunTrigger } from '../../entities/report-run-trigger.entity';
import { LegacyDataStorageService } from '../../services/legacy-data-marts/legacy-data-storage.service';

@Injectable()
export class MoveLegacyDataStorageService {
  private readonly logger = new Logger(MoveLegacyDataStorageService.name);

  constructor(
    private readonly legacyDataStorageService: LegacyDataStorageService,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  async run(storage: DataStorage, newProjectId: string): Promise<DataStorage> {
    const oldProjectId = storage.projectId;

    this.logger.log(`Moving storage ${storage.id} from project ${oldProjectId} to ${newProjectId}`);

    this.legacyDataStorageService.validateSyncPermissionForProject(newProjectId);

    return await this.dataSource.transaction(async manager => {
      const subQueryParams = { storageId: storage.id, oldProjectId };

      const dataMartSubQuery = manager
        .createQueryBuilder()
        .subQuery()
        .select('dm.id')
        .from(DataMart, 'dm')
        .where('dm.storageId = :storageId AND dm.projectId = :oldProjectId')
        .getQuery();

      const reportSubQuery = manager
        .createQueryBuilder()
        .subQuery()
        .select('r.id')
        .from(Report, 'r')
        .where(`r.dataMartId IN ${dataMartSubQuery}`)
        .getQuery();

      // Delete ReportRunTriggers first (references reportId)
      const reportTriggerResult = await manager
        .createQueryBuilder()
        .delete()
        .from(ReportRunTrigger)
        .where(`reportId IN ${reportSubQuery}`, subQueryParams)
        .execute();

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

      const connectorTriggerResult = await manager
        .createQueryBuilder()
        .delete()
        .from(ConnectorRunTrigger)
        .where(`dataMartId IN ${dataMartSubQuery}`, subQueryParams)
        .execute();

      const runResult = await manager
        .createQueryBuilder()
        .delete()
        .from(DataMartRun)
        .where(`dataMartId IN ${dataMartSubQuery}`, subQueryParams)
        .execute();

      const dataMartResult = await manager
        .createQueryBuilder()
        .update(DataMart)
        .set({ projectId: newProjectId })
        .where('storageId = :storageId AND projectId = :oldProjectId', {
          storageId: storage.id,
          oldProjectId,
        })
        .execute();

      // Move storage and credentials to a new project
      await manager.update(DataStorage, storage.id, { projectId: newProjectId });
      if (storage.credential) {
        await manager.update(DataStorageCredential, storage.credential.id, {
          projectId: newProjectId,
        });
      }

      this.logger.log(
        `Moved storage ${storage.id}: deleted ${reportResult.affected ?? 0} reports, ` +
          `${triggerResult.affected ?? 0} scheduled triggers, ` +
          `${connectorTriggerResult.affected ?? 0} connector triggers, ` +
          `${reportTriggerResult.affected ?? 0} report triggers, ` +
          `${runResult.affected ?? 0} runs; updated ${dataMartResult.affected ?? 0} data marts`
      );

      return await manager.findOneOrFail(DataStorage, {
        where: { id: storage.id },
        relations: ['credential'],
      });
    });
  }
}
