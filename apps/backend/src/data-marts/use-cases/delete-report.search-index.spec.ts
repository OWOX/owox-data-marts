jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { SearchableEntityType } from '../../common/search/search.facade';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { GoogleSheetsConfigType } from '../data-destination-types/google-sheets/schemas/google-sheets-config.schema';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DeleteReportCommand } from '../dto/domain/delete-report.command';
import { ConnectorState } from '../entities/connector-state.entity';
import { Context } from '../entities/context.entity';
import { DataDestinationCredential } from '../entities/data-destination-credential.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { DataMartBusinessOwner } from '../entities/data-mart-business-owner.entity';
import { DataMartContext } from '../entities/data-mart-context.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartTechnicalOwner } from '../entities/data-mart-technical-owner.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorageCredential } from '../entities/data-storage-credential.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DestinationContext } from '../entities/destination-context.entity';
import { DestinationOwner } from '../entities/destination-owner.entity';
import { MemberRoleContext } from '../entities/member-role-context.entity';
import { ReportOwner } from '../entities/report-owner.entity';
import { Report } from '../entities/report.entity';
import { SearchReindexTrigger } from '../entities/search/search-reindex-trigger.entity';
import { StorageContext } from '../entities/storage-context.entity';
import { StorageOwner } from '../entities/storage-owner.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { ReportService } from '../services/report.service';
import { DeleteReportService } from './delete-report.service';

describe('DeleteReportService search queue with SQLite', () => {
  it('schedules DELETE for the removed report without changing another report REINDEX', async () => {
    initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
    const dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: true,
      entities: [
        Report,
        ReportOwner,
        DataMart,
        DataStorage,
        DataStorageCredential,
        DataMartContext,
        DataMartBusinessOwner,
        DataMartTechnicalOwner,
        DataMartRelationship,
        ConnectorState,
        Context,
        StorageOwner,
        StorageContext,
        MemberRoleContext,
        DataDestination,
        DataDestinationCredential,
        DestinationOwner,
        DestinationContext,
        SearchReindexTrigger,
      ],
    }).initialize();
    addTransactionalDataSource(dataSource);

    try {
      const storage = await dataSource.getRepository(DataStorage).save({
        type: DataStorageType.GOOGLE_BIGQUERY,
        projectId: 'proj-1',
        createdById: 'user-1',
      });
      const dataMart = await dataSource.getRepository(DataMart).save({
        title: 'Data Mart',
        projectId: 'proj-1',
        status: DataMartStatus.PUBLISHED,
        createdById: 'user-1',
        storage,
      });
      const dataDestination = await dataSource.getRepository(DataDestination).save({
        title: 'Sheets',
        type: DataDestinationType.GOOGLE_SHEETS,
        projectId: 'proj-1',
        createdById: 'user-1',
      });
      const reportRepository = dataSource.getRepository(Report);
      await reportRepository.save(
        ['report-a', 'report-b'].map(id =>
          reportRepository.create({
            id,
            title: id,
            dataMart,
            dataDestination,
            createdById: 'user-1',
            destinationConfig: {
              type: GoogleSheetsConfigType,
              spreadsheetId: id,
              sheetId: 0,
            },
          })
        )
      );
      const triggerRepository = dataSource.getRepository(SearchReindexTrigger);
      const indexSync = new AdvancedSearchIndexSyncService(
        triggerRepository,
        null as never,
        null as never,
        null as never,
        null as never
      );
      await indexSync.scheduleReindex(SearchableEntityType.REPORT, 'report-b', 'proj-1');
      const pendingReindex = await triggerRepository.findOneByOrFail({ entityId: 'report-b' });
      const service = new DeleteReportService(
        reportRepository,
        new ReportService(
          reportRepository,
          { deleteAllByReportIdAndDataMartIdAndProjectId: jest.fn() } as never,
          null as never,
          { invalidateByReportId: jest.fn() } as never
        ),
        { checkMutateAccess: jest.fn() } as never,
        new EventEmitter2(),
        indexSync
      );

      await service.run(new DeleteReportCommand('report-a', 'proj-1', 'user-1', ['admin']));

      await expect(
        reportRepository.findOne({ where: { id: 'report-a' }, withDeleted: true })
      ).resolves.toMatchObject({ id: 'report-a', deletedAt: expect.any(Date) });
      await expect(reportRepository.existsBy({ id: 'report-a' })).resolves.toBe(false);
      await expect(reportRepository.existsBy({ id: 'report-b' })).resolves.toBe(true);
      await expect(triggerRepository.findOneByOrFail({ entityId: 'report-b' })).resolves.toEqual(
        pendingReindex
      );
      await expect(triggerRepository.findOneBy({ entityId: 'report-a' })).resolves.toMatchObject({
        entityType: SearchableEntityType.REPORT,
        projectId: 'proj-1',
        operation: 'DELETE',
        status: TriggerStatus.IDLE,
      });
    } finally {
      deleteDataSourceByName('default');
      await dataSource.destroy();
    }
  });
});
