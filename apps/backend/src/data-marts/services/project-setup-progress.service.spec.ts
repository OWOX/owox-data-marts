import type { Repository } from 'typeorm';
import { ProjectSetupProgress } from '../entities/project-setup-progress.entity';
import { ProjectSetupUserProgress } from '../entities/project-setup-user-progress.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { Report } from '../entities/report.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { ProjectSetupProgressService } from './project-setup-progress.service';

describe('ProjectSetupProgressService', () => {
  const createRepository = <T>() =>
    ({
      findOne: jest.fn(),
      create: jest.fn(data => data),
      save: jest.fn(entity => Promise.resolve(entity)),
      count: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    }) as unknown as jest.Mocked<Repository<T>>;

  const createService = () => {
    const progressRepository = createRepository<ProjectSetupProgress>();
    const userProgressRepository = createRepository<ProjectSetupUserProgress>();
    const dataStorageRepository = createRepository<DataStorage>();
    const dataMartRepository = createRepository<DataMart>();
    const dataDestinationRepository = createRepository<DataDestination>();
    const reportRepository = createRepository<Report>();
    const dataMartRunRepository = createRepository<DataMartRun>();
    const idpProjectionsFacade = {
      getProjectMembers: jest.fn().mockResolvedValue([{ userId: 'user-1' }]),
    };

    const service = new ProjectSetupProgressService(
      progressRepository,
      userProgressRepository,
      dataStorageRepository,
      dataMartRepository,
      dataDestinationRepository,
      reportRepository,
      dataMartRunRepository,
      idpProjectionsFacade as never
    );

    return {
      service,
      progressRepository,
      userProgressRepository,
      dataMartRepository,
      dataMartRunRepository,
      idpProjectionsFacade,
    };
  };

  it('normalizes old persisted steps before returning merged progress', async () => {
    const { service, progressRepository, userProgressRepository, dataMartRepository } =
      createService();
    dataMartRepository.find.mockResolvedValue([]);

    progressRepository.findOne.mockResolvedValue({
      id: 'progress-1',
      projectId: 'project-1',
      version: 1,
      stepsSchemaVersion: 1,
      steps: {
        hasStorage: { done: true, completedAt: '2026-05-11T13:45:15.136Z' },
        hasDraftDataMart: { done: true, completedAt: '2026-05-11T13:45:20.759Z' },
        hasPublishedDataMart: { done: true, completedAt: '2026-05-11T14:00:11.257Z' },
        hasDestination: { done: true, completedAt: '2026-05-11T13:58:00.558Z' },
        hasReport: { done: true, completedAt: '2026-05-11T14:02:17.414Z' },
        hasReportRun: { done: false, completedAt: null },
        hasTeammatesInvited: { done: true, completedAt: '2026-05-29T09:38:58.410Z' },
      },
    } as ProjectSetupProgress);
    userProgressRepository.findOne.mockResolvedValue({
      id: 'user-progress-1',
      projectId: 'project-1',
      userId: 'user-1',
      version: 1,
      stepsSchemaVersion: 1,
      steps: {
        hasReportRun: { done: true, completedAt: '2026-05-11T14:02:32.873Z' },
      },
    } as ProjectSetupUserProgress);

    const result = await service.getFullProgress('project-1', 'user-1');

    expect(result.mergedSteps).toEqual(
      expect.objectContaining({
        hasReportRun: { done: true, completedAt: '2026-05-11T14:02:32.873Z' },
        hasGoogleSheetsDestination: { done: false, completedAt: null },
        hasGoogleSheetsExtension: { done: false, completedAt: null },
        hasGoogleSheetsReportRun: { done: false, completedAt: null },
        hasMcpQuery: { done: false, completedAt: null },
      })
    );
    expect(Object.keys(result.mergedSteps).sort()).toEqual(
      [
        'hasStorage',
        'hasDraftDataMart',
        'hasPublishedDataMart',
        'hasDestination',
        'hasReport',
        'hasReportRun',
        'hasTeammatesInvited',
        'hasGoogleSheetsDestination',
        'hasGoogleSheetsExtension',
        'hasGoogleSheetsReportRun',
        'hasMcpQuery',
      ].sort()
    );
  });

  it('marks hasMcpQuery as done when the user has a successful MCP query run', async () => {
    const {
      service,
      progressRepository,
      userProgressRepository,
      dataMartRepository,
      dataMartRunRepository,
    } = createService();

    progressRepository.findOne.mockResolvedValue({
      id: 'progress-1',
      projectId: 'project-1',
      version: 1,
      stepsSchemaVersion: 1,
      steps: {},
    } as unknown as ProjectSetupProgress);
    userProgressRepository.findOne.mockResolvedValue(null);
    dataMartRepository.find.mockResolvedValue([{ id: 'dm-1' }] as DataMart[]);

    dataMartRunRepository.createQueryBuilder.mockImplementation(() => {
      let requestedTypes: DataMartRunType[] | undefined;
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn((_clause: string, params?: Record<string, unknown>) => {
          if (params && 'types' in params) requestedTypes = params.types as DataMartRunType[];
          return qb;
        }),
        limit: jest.fn().mockReturnThis(),
        getOne: jest.fn(() =>
          Promise.resolve(
            requestedTypes?.includes(DataMartRunType.MCP_QUERY) ? { id: 'run-1' } : null
          )
        ),
      };
      return qb as unknown as ReturnType<Repository<DataMartRun>['createQueryBuilder']>;
    });

    const result = await service.getFullProgress('project-1', 'user-1');

    expect(result.mergedSteps.hasMcpQuery).toEqual({
      done: true,
      completedAt: expect.any(String) as string,
    });
    expect(result.mergedSteps.hasReportRun.done).toBe(false);
  });
});
