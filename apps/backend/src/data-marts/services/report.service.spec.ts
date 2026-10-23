import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import * as path from 'node:path';
import { DataSource, Repository } from 'typeorm';
import { ScheduledTriggerService } from './scheduled-trigger.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { Report } from '../entities/report.entity';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { ReportService } from './report.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { LookerStudioConnectorConfigType } from '../data-destination-types/looker-studio-connector/schemas/looker-studio-connector-config.schema';
import { LookerStudioConnectorCredentialsType } from '../data-destination-types/looker-studio-connector/schemas/looker-studio-connector-credentials.schema';
import { DataDestination } from '../entities/data-destination.entity';
import { DataDestinationCredential } from '../entities/data-destination-credential.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';

describe('ReportService', () => {
  const createService = () => {
    const repository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const scheduledTriggerService = {} as unknown as ScheduledTriggerService;
    const systemTimeService = {} as unknown as SystemTimeService;

    const service = new ReportService(
      repository as unknown as Repository<Report>,
      scheduledTriggerService,
      systemTimeService,
      {} as never
    );

    return { service, repository };
  };

  it('marks report run state as cancelled without changing counters', async () => {
    const { service, repository } = createService();

    await service.markRunAsCancelled('report-1');

    expect(repository.update).toHaveBeenCalledWith(
      { id: 'report-1', lastRunStatus: ReportRunStatus.RUNNING },
      {
        lastRunStatus: ReportRunStatus.CANCELLED,
      }
    );
  });

  it('persists the final run outcome as a targeted update, never a full entity save', async () => {
    // A full save would cascade the run-start DataMart snapshot over columns written during
    // the run (e.g. dataLastUpdated) — the outcome must touch only the Report's own scalars.
    const { service, repository } = createService();
    const report = {
      id: 'report-1',
      lastRunStatus: ReportRunStatus.ERROR,
      lastRunError: 'boom',
    } as Report;

    await service.updateLastRunOutcome(report);

    expect(repository.update).toHaveBeenCalledWith('report-1', {
      lastRunStatus: ReportRunStatus.ERROR,
      lastRunError: 'boom',
    });
  });

  it('clears lastRunError with an explicit NULL on a successful outcome', async () => {
    const { service, repository } = createService();
    const report = {
      id: 'report-1',
      lastRunStatus: ReportRunStatus.SUCCESS,
      lastRunError: undefined,
    } as Report;

    await service.updateLastRunOutcome(report);

    const [id, patch] = repository.update.mock.calls[0] as [
      string,
      { lastRunStatus: ReportRunStatus; lastRunError: () => string },
    ];
    expect(id).toBe('report-1');
    expect(patch.lastRunStatus).toBe(ReportRunStatus.SUCCESS);
    // `update` silently skips undefined values, so the clear must be an explicit NULL.
    expect(patch.lastRunError()).toBe('NULL');
  });

  it('loads report by id scoped to project with data mart relation', async () => {
    const { service, repository } = createService();
    const report = {
      id: 'report-1',
      dataMart: { id: 'data-mart-1', projectId: 'project-1' },
    } as Report;
    repository.findOne.mockResolvedValueOnce(report);

    await expect(service.getByIdAndProjectId('report-1', 'project-1')).resolves.toBe(report);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'report-1', dataMart: { projectId: 'project-1' } },
      relations: ['dataMart'],
    });
  });

  it('throws NotFoundException when report is missing from the project', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValueOnce(null);

    await expect(service.getByIdAndProjectId('missing-report', 'project-1')).rejects.toThrow(
      NotFoundException
    );
  });

  describe('countByDataMartIds', () => {
    it('groups the reports by Data Mart and returns numeric counts', async () => {
      const qb = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { dataMartId: 'dm-1', count: '3' },
          { dataMartId: 'dm-2', count: 1 },
        ]),
      };
      const repository = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
      const service = new ReportService(repository as never, {} as never, {} as never, {} as never);

      const counts = await service.countByDataMartIds(['dm-1', 'dm-2', 'dm-3']);

      expect(Object.fromEntries(counts)).toEqual({ 'dm-1': 3, 'dm-2': 1 });
      expect(qb.where).toHaveBeenCalledWith('dm.id IN (:...ids)', {
        ids: ['dm-1', 'dm-2', 'dm-3'],
      });
    });

    it('skips the query when there are no Data Marts', async () => {
      const repository = { createQueryBuilder: jest.fn() };
      const service = new ReportService(repository as never, {} as never, {} as never, {} as never);

      expect((await service.countByDataMartIds([])).size).toBe(0);
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('Looker Studio report queries', () => {
    let dataSource: DataSource;
    let service: ReportService;
    let destinationId: string;

    beforeAll(async () => {
      dataSource = new DataSource({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [path.join(__dirname, '../entities/*.entity.ts')],
        synchronize: true,
      });
      await dataSource.initialize();
      service = new ReportService(
        dataSource.getRepository(Report),
        {} as never,
        {} as never,
        {} as never
      );
      const credential = await dataSource.getRepository(DataDestinationCredential).save({
        projectId: 'p1',
        type: DestinationCredentialType.LOOKER_STUDIO,
        credentials: { type: LookerStudioConnectorCredentialsType, destinationSecretKey: 'secret' },
      });
      const destination = await dataSource.getRepository(DataDestination).save({
        title: 'Looker',
        type: DataDestinationType.LOOKER_STUDIO,
        projectId: 'p1',
        credentialId: credential.id,
      });
      destinationId = destination.id;
    }, 30_000);

    afterAll(() => dataSource.destroy());

    async function saveReport(type: DataStorageType): Promise<string> {
      const storage = await dataSource.getRepository(DataStorage).save({ type, projectId: 'p1' });
      const dataMart = await dataSource
        .getRepository(DataMart)
        .save({ title: 'dm', projectId: 'p1', createdById: 'u1', storage: { id: storage.id } });
      const report = await dataSource.getRepository(Report).save({
        title: type,
        createdById: 'u1',
        dataMart: { id: dataMart.id },
        dataDestination: { id: destinationId },
        destinationConfig: { type: LookerStudioConnectorConfigType, cacheLifetime: 300 },
      });
      return report.id;
    }

    it('returns a report on a DuckDB Storage, which has no credentials row', async () => {
      const onDuckDb = await saveReport(DataStorageType.DUCKDB);

      const all = await service.getAllByDestinationIdAndLookerStudioSecret(destinationId, 'secret');
      expect(all.map(report => report.id)).toEqual([onDuckDb]);

      await expect(service.getByIdAndLookerStudioSecret(onDuckDb, 'secret')).resolves.toMatchObject(
        { id: onDuckDb }
      );
    });
  });
});
