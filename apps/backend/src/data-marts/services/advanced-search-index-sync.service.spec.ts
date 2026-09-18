import { Test, TestingModule } from '@nestjs/testing';
import { AdvancedSearchIndexSyncService } from './advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { In } from 'typeorm';
import type { SearchReindexTrigger } from '../entities/search/search-reindex-trigger.entity';
import type { SearchDataStorageProjectReindexTrigger } from '../entities/search/search-project-reindex-trigger.entity';

function makeTrigger(overrides: Partial<SearchReindexTrigger> = {}): SearchReindexTrigger {
  return {
    id: 'trigger-1',
    isActive: true,
    version: 1,
    status: TriggerStatus.IDLE,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    modifiedAt: new Date('2024-01-01T00:00:00.000Z'),
    projectId: 'proj-1',
    entityType: SearchableEntityType.DATA_MART,
    entityId: 'dm-1',
    operation: 'REINDEX',
    onSuccess: jest.fn(),
    onError: jest.fn(),
    ...overrides,
  } as unknown as SearchReindexTrigger;
}

describe('AdvancedSearchIndexSyncService', () => {
  let service: AdvancedSearchIndexSyncService;
  let triggerRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let dataMartProjectTriggerRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let dataStorageProjectTriggerRepo: typeof dataMartProjectTriggerRepo;
  let dataDestinationProjectTriggerRepo: typeof dataMartProjectTriggerRepo;
  let reportProjectTriggerRepo: typeof dataMartProjectTriggerRepo;

  beforeEach(async () => {
    triggerRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(makeTrigger()),
      create: jest.fn().mockImplementation((dto: object) => ({ ...dto })),
    };
    dataMartProjectTriggerRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((dto: object) => ({ ...dto })),
    };
    dataStorageProjectTriggerRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((dto: object) => ({ ...dto })),
    };
    dataDestinationProjectTriggerRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((dto: object) => ({ ...dto })),
    };
    reportProjectTriggerRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((dto: object) => ({ ...dto })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvancedSearchIndexSyncService,
        {
          provide: 'SearchReindexTriggerRepository',
          useValue: triggerRepo,
        },
        {
          provide: 'SearchDataMartProjectReindexTriggerRepository',
          useValue: dataMartProjectTriggerRepo,
        },
        {
          provide: 'SearchDataStorageProjectReindexTriggerRepository',
          useValue: dataStorageProjectTriggerRepo,
        },
        {
          provide: 'SearchDataDestinationProjectReindexTriggerRepository',
          useValue: dataDestinationProjectTriggerRepo,
        },
        {
          provide: 'SearchReportProjectReindexTriggerRepository',
          useValue: reportProjectTriggerRepo,
        },
      ],
    })
      .overrideProvider('SearchReindexTriggerRepository')
      .useValue(triggerRepo)
      .overrideProvider('SearchDataMartProjectReindexTriggerRepository')
      .useValue(dataMartProjectTriggerRepo)
      .overrideProvider('SearchDataStorageProjectReindexTriggerRepository')
      .useValue(dataStorageProjectTriggerRepo)
      .overrideProvider('SearchDataDestinationProjectReindexTriggerRepository')
      .useValue(dataDestinationProjectTriggerRepo)
      .overrideProvider('SearchReportProjectReindexTriggerRepository')
      .useValue(reportProjectTriggerRepo)
      .compile();

    service = module.get(AdvancedSearchIndexSyncService);
  });

  describe.each(['scheduleReindex', 'scheduleDelete'] as const)('%s invalid entity IDs', action => {
    it.each([undefined, null, '', '   '])(
      'does not touch the queue when entityId is %p',
      async entityId => {
        const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

        try {
          await expect(
            service[action](SearchableEntityType.REPORT, entityId as string, 'proj-1')
          ).resolves.toBeUndefined();

          expect(triggerRepo.findOne).not.toHaveBeenCalled();
          expect(triggerRepo.create).not.toHaveBeenCalled();
          expect(triggerRepo.save).not.toHaveBeenCalled();
          expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${action} failed:`));
        } finally {
          warn.mockRestore();
        }
      }
    );
  });

  describe('scheduleReindex', () => {
    it('creates a new IDLE REINDEX trigger when none exists', async () => {
      await service.scheduleReindex(SearchableEntityType.DATA_MART, 'dm-1', 'proj-1');

      expect(triggerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: SearchableEntityType.DATA_MART,
          entityId: 'dm-1',
          operation: 'REINDEX',
          projectId: 'proj-1',
          isActive: true,
          status: TriggerStatus.IDLE,
        })
      );
      expect(triggerRepo.save).toHaveBeenCalled();
    });

    it('updates existing IDLE trigger operation and projectId instead of creating a duplicate', async () => {
      const existing = makeTrigger({ operation: 'DELETE' });
      triggerRepo.findOne.mockResolvedValue(existing);

      await service.scheduleReindex(SearchableEntityType.DATA_MART, 'dm-1', 'proj-2');

      expect(triggerRepo.create).not.toHaveBeenCalled();
      expect(existing.operation).toBe('REINDEX');
      expect(existing.projectId).toBe('proj-2');
      expect(triggerRepo.save).toHaveBeenCalledWith(existing);
    });

    it('looks up existing trigger by entityType, entityId, and IDLE status', async () => {
      const { IsNull } = await import('typeorm');

      await service.scheduleReindex(SearchableEntityType.DATA_MART, 'dm-1', 'proj-1');

      expect(triggerRepo.findOne).toHaveBeenCalledWith({
        where: {
          entityType: SearchableEntityType.DATA_MART,
          entityId: 'dm-1',
          status: TriggerStatus.IDLE,
          operation: In(['REINDEX', 'DELETE']),
        },
      });

      const callArg = triggerRepo.findOne.mock.calls[0][0].where;
      expect(callArg.entityId).not.toEqual(IsNull());
    });

    it('does not reject when trigger scheduling storage fails', async () => {
      triggerRepo.findOne.mockRejectedValue(new Error('trigger table locked'));

      await expect(
        service.scheduleReindex(SearchableEntityType.DATA_MART, 'dm-1', 'proj-1')
      ).resolves.toBeUndefined();
    });
  });

  describe('scheduleDelete', () => {
    it('creates a new IDLE DELETE trigger when none exists', async () => {
      await service.scheduleDelete(SearchableEntityType.DATA_MART, 'dm-1', 'proj-1');

      expect(triggerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: SearchableEntityType.DATA_MART,
          entityId: 'dm-1',
          operation: 'DELETE',
          projectId: 'proj-1',
          isActive: true,
          status: TriggerStatus.IDLE,
        })
      );
    });

    it('updates existing IDLE trigger to DELETE when a pending REINDEX already exists', async () => {
      const existing = makeTrigger({ operation: 'REINDEX' });
      triggerRepo.findOne.mockResolvedValue(existing);

      await service.scheduleDelete(SearchableEntityType.DATA_MART, 'dm-1', 'proj-1');

      expect(existing.operation).toBe('DELETE');
      expect(triggerRepo.save).toHaveBeenCalledWith(existing);
      expect(triggerRepo.create).not.toHaveBeenCalled();
    });

    it('does not reject when delete scheduling storage fails', async () => {
      triggerRepo.findOne.mockRejectedValue(new Error('trigger table locked'));

      await expect(
        service.scheduleDelete(SearchableEntityType.DATA_MART, 'dm-1', 'proj-1')
      ).resolves.toBeUndefined();
    });
  });

  describe('scheduleReindexMany', () => {
    it('deduplicates entity IDs before scheduling REINDEX triggers', async () => {
      await service.scheduleReindexMany(
        SearchableEntityType.DATA_MART,
        ['dm-1', 'dm-2', 'dm-1'],
        'proj-1'
      );

      expect(triggerRepo.create).toHaveBeenCalledTimes(2);
      expect(triggerRepo.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ entityId: 'dm-1', operation: 'REINDEX' })
      );
      expect(triggerRepo.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ entityId: 'dm-2', operation: 'REINDEX' })
      );
    });
  });

  describe('scheduleTypeProjectSync', () => {
    it('creates a data storage project trigger in the data storage queue', async () => {
      await service.scheduleTypeProjectSync(SearchableEntityType.DATA_STORAGE, 'proj-1');

      expect(dataStorageProjectTriggerRepo.findOne).toHaveBeenCalledWith({
        where: {
          projectId: 'proj-1',
          status: In([TriggerStatus.IDLE, TriggerStatus.READY, TriggerStatus.PROCESSING]),
        },
      });

      expect(dataStorageProjectTriggerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          isActive: true,
          status: TriggerStatus.IDLE,
        })
      );
      expect(triggerRepo.create).not.toHaveBeenCalled();
      expect(dataMartProjectTriggerRepo.create).not.toHaveBeenCalled();
      expect(dataDestinationProjectTriggerRepo.create).not.toHaveBeenCalled();
    });

    it('dispatches report syncs to the report queue', async () => {
      await service.scheduleTypeProjectSync(SearchableEntityType.REPORT, 'proj-report');

      expect(reportProjectTriggerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-report', status: TriggerStatus.IDLE })
      );
      expect(dataMartProjectTriggerRepo.create).not.toHaveBeenCalled();
      expect(dataStorageProjectTriggerRepo.create).not.toHaveBeenCalled();
      expect(dataDestinationProjectTriggerRepo.create).not.toHaveBeenCalled();
    });

    it('dispatches data mart and data destination syncs to their own queues', async () => {
      await service.scheduleTypeProjectSync(SearchableEntityType.DATA_MART, 'proj-mart');
      await service.scheduleTypeProjectSync(SearchableEntityType.DATA_DESTINATION, 'proj-dest');

      expect(dataMartProjectTriggerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-mart' })
      );
      expect(dataDestinationProjectTriggerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-dest' })
      );
      expect(dataStorageProjectTriggerRepo.create).not.toHaveBeenCalled();
    });

    it('deduplicates project triggers including one already processing by default', async () => {
      dataStorageProjectTriggerRepo.findOne.mockResolvedValue({
        projectId: 'proj-1',
        status: TriggerStatus.PROCESSING,
      } as SearchDataStorageProjectReindexTrigger);

      await service.scheduleTypeProjectSync(SearchableEntityType.DATA_STORAGE, 'proj-1');

      expect(dataStorageProjectTriggerRepo.findOne).toHaveBeenCalledWith({
        where: {
          projectId: 'proj-1',
          status: In([TriggerStatus.IDLE, TriggerStatus.READY, TriggerStatus.PROCESSING]),
        },
      });
      expect(dataStorageProjectTriggerRepo.create).not.toHaveBeenCalled();
      expect(dataStorageProjectTriggerRepo.save).not.toHaveBeenCalled();
    });

    it('does not reuse a project trigger from another project', async () => {
      const existing = {
        projectId: 'proj-old',
        status: TriggerStatus.IDLE,
      } as SearchDataStorageProjectReindexTrigger;
      dataStorageProjectTriggerRepo.findOne.mockImplementation(async ({ where }) =>
        where.projectId === 'proj-new' ? null : existing
      );

      await service.scheduleTypeProjectSync(SearchableEntityType.DATA_STORAGE, 'proj-new');

      expect(dataStorageProjectTriggerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-new',
        })
      );
      expect(existing.projectId).toBe('proj-old');
    });

    it('reuses an existing IDLE project trigger for the same project', async () => {
      const existing = {
        projectId: 'proj-1',
        status: TriggerStatus.IDLE,
      } as SearchDataStorageProjectReindexTrigger;
      dataStorageProjectTriggerRepo.findOne.mockResolvedValue(existing);

      await service.scheduleTypeProjectSync(SearchableEntityType.DATA_STORAGE, 'proj-1');

      expect(dataStorageProjectTriggerRepo.create).not.toHaveBeenCalled();
      expect(existing.projectId).toBe('proj-1');
      expect(dataStorageProjectTriggerRepo.save).not.toHaveBeenCalled();
    });

    it('does not mutate an already claimed project trigger', async () => {
      const existing = {
        projectId: 'proj-1',
        status: TriggerStatus.READY,
      } as SearchDataStorageProjectReindexTrigger;
      dataStorageProjectTriggerRepo.findOne.mockResolvedValue(existing);

      await service.scheduleTypeProjectSync(SearchableEntityType.DATA_STORAGE, 'proj-1');

      expect(dataStorageProjectTriggerRepo.create).not.toHaveBeenCalled();
      expect(dataStorageProjectTriggerRepo.save).not.toHaveBeenCalled();
    });

    it('does not reject when project trigger scheduling storage fails', async () => {
      dataStorageProjectTriggerRepo.findOne.mockRejectedValue(new Error('trigger table locked'));

      await expect(
        service.scheduleTypeProjectSync(SearchableEntityType.DATA_STORAGE, 'proj-1')
      ).resolves.toBeUndefined();
    });
  });
  it('schedules each parent rename in the fast queue without using the project queue', async () => {
    await Promise.all([
      service.scheduleReportsReindex(SearchableEntityType.DATA_MART, 'dm-1', 'proj-1'),
      service.scheduleReportsReindex(SearchableEntityType.DATA_MART, 'dm-1', 'proj-1'),
    ]);
    expect(triggerRepo.save).toHaveBeenCalledTimes(2);
    expect(triggerRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'REINDEX_REPORTS',
        entityType: SearchableEntityType.DATA_MART,
        entityId: 'dm-1',
        projectId: 'proj-1',
        reportProgress: null,
        status: TriggerStatus.IDLE,
      })
    );
    expect(reportProjectTriggerRepo.save).not.toHaveBeenCalled();
  });
});
