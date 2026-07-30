import { Repository } from 'typeorm';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import {
  DataQualitySummaryService,
  createNoRunDataQualitySummary,
} from './data-quality-summary.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';

describe('DataQualitySummaryService', () => {
  const qb = {
    select: jest.fn(),
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    setParameters: jest.fn(),
    getMany: jest.fn(),
  };
  Object.values(qb).forEach(mock => {
    if (typeof mock === 'function') mock.mockReturnValue(qb);
  });

  const repository = {
    createQueryBuilder: jest.fn(() => qb),
  } as unknown as Repository<DataMartRun>;
  const dataMartRepository = {
    find: jest.fn(),
  } as unknown as Repository<DataMart>;
  const relationshipService = {
    findGraphEdgesByProjectIdAndSourceDataMartIds: jest.fn(),
  } as unknown as DataMartRelationshipService;
  const service = new DataQualitySummaryService(
    repository,
    dataMartRepository,
    relationshipService
  );

  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(qb).forEach(mock => {
      if (typeof mock === 'function' && mock !== qb.getMany) mock.mockReturnValue(qb);
    });
  });

  it('uses the run id as a deterministic tie-breaker when two runs have the same createdAt', async () => {
    qb.getMany.mockResolvedValue([
      {
        id: 'run-b',
        dataMartId: 'dm-b',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        startedAt: new Date('2026-01-01T00:01:00Z'),
        finishedAt: new Date('2026-01-01T00:02:00Z'),
        dataQualitySummary: {
          state: DataQualitySummaryState.ISSUES,
          enabledChecks: 2,
          totalChecks: 2,
          passedChecks: 1,
          failedChecks: 1,
          notApplicableChecks: 0,
          errorChecks: 0,
          noticeFindings: 0,
          warningFindings: 1,
          errorFindings: 0,
          violationCount: 3,
          highestSeverity: DataQualitySeverity.WARNING,
        },
      },
    ]);

    const result = await service.getLatestByDataMartIds(['dm-a', 'dm-b'], 'project-1');

    expect(result.get('dm-b')).toMatchObject({
      dataMartRunId: 'run-b',
      lastRunAt: new Date('2026-01-01T00:02:00Z'),
      state: DataQualitySummaryState.ISSUES,
    });
    expect(repository.createQueryBuilder).toHaveBeenCalledWith('run');
    expect(qb.select).toHaveBeenCalledWith([
      'run.id',
      'run.dataMartId',
      'run.createdAt',
      'run.startedAt',
      'run.finishedAt',
      'run.dataQualitySummary',
    ]);
    expect(qb.getMany).toHaveBeenCalledTimes(1);
    expect(qb.leftJoin).toHaveBeenCalledWith(
      expect.any(Function),
      'newerRun',
      expect.stringContaining('newerRun.createdAt = run.createdAt')
    );
    expect(qb.leftJoin).toHaveBeenCalledWith(
      expect.any(Function),
      'newerRun',
      expect.stringContaining('newerRun.id > run.id')
    );
    expect(qb.andWhere).toHaveBeenCalledWith('dataMart.projectId = :projectId');
    expect(qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('createdAt >='));
  });

  it('skips the query for an empty page', async () => {
    await expect(service.getLatestByDataMartIds([], 'project-1')).resolves.toEqual(new Map());
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns the current summary for one Data Mart', async () => {
    const summary = createNoRunDataQualitySummary(1);
    const currentSpy = jest
      .spyOn(service, 'getCurrentByDataMarts')
      .mockResolvedValueOnce(new Map([['dm-1', summary]]));

    await expect(service.getCurrentByDataMart({ id: 'dm-1' } as never, 'project-1')).resolves.toBe(
      summary
    );
    currentSpy.mockRestore();
  });

  it('loads current summaries for requested Data Mart ids within the project boundary', async () => {
    const dataMarts = [{ id: 'dm-1', projectId: 'project-1' }] as DataMart[];
    const summary = createNoRunDataQualitySummary(1);
    (dataMartRepository.find as jest.Mock).mockResolvedValueOnce(dataMarts);
    const currentSpy = jest
      .spyOn(service, 'getCurrentByDataMarts')
      .mockResolvedValueOnce(new Map([['dm-1', summary]]));

    await expect(service.getCurrentByDataMartIds(['dm-1', 'dm-1'], 'project-1')).resolves.toEqual(
      new Map([['dm-1', summary]])
    );

    expect(dataMartRepository.find).toHaveBeenCalledWith({
      where: {
        id: expect.anything(),
        projectId: 'project-1',
      },
      select: ['id', 'schema', 'dataQualityConfig'],
    });
    expect(currentSpy).toHaveBeenCalledWith(dataMarts, 'project-1');
    currentSpy.mockRestore();
  });

  it('derives current no-run counts in bulk and distinguishes preset from saved all-disabled', async () => {
    qb.getMany.mockResolvedValue([]);
    (
      relationshipService.findGraphEdgesByProjectIdAndSourceDataMartIds as jest.Mock
    ).mockResolvedValue([]);

    const summaries = await service.getCurrentByDataMarts(
      [
        {
          id: 'dm-preset',
          dataQualityConfig: null,
          schema: null,
          definitionType: null,
        },
        {
          id: 'dm-disabled',
          dataQualityConfig: { rules: [] },
          schema: null,
          definitionType: null,
        },
      ] as never[],
      'project-1'
    );

    expect(summaries.get('dm-preset')).toMatchObject({
      state: DataQualitySummaryState.NEVER_RUN,
      enabledChecks: 1,
    });
    expect(summaries.get('dm-disabled')).toMatchObject({
      state: DataQualitySummaryState.ALL_DISABLED,
      enabledChecks: 0,
    });
    expect(relationshipService.findGraphEdgesByProjectIdAndSourceDataMartIds).toHaveBeenCalledTimes(
      1
    );
    expect(qb.getMany).toHaveBeenCalledTimes(1);
  });

  it('does not count an enabled check that is no longer applicable', async () => {
    qb.getMany.mockResolvedValue([]);
    (
      relationshipService.findGraphEdgesByProjectIdAndSourceDataMartIds as jest.Mock
    ).mockResolvedValue([]);

    const summaries = await service.getCurrentByDataMarts(
      [
        {
          id: 'dm-without-pk',
          dataQualityConfig: {
            rules: [
              {
                key: 'pk_uniqueness:data_mart',
                category: 'pk_uniqueness',
                scope: { type: 'DATA_MART' },
                severity: 'error',
                enabled: true,
                parameters: {},
              },
            ],
          },
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [
              {
                name: 'id',
                type: 'INT64',
                mode: 'NULLABLE',
                status: 'CONNECTED',
                isPrimaryKey: false,
                isHiddenForReporting: false,
              },
            ],
          },
        },
      ] as never[],
      'project-1'
    );

    expect(summaries.get('dm-without-pk')).toMatchObject({
      state: DataQualitySummaryState.ALL_DISABLED,
      enabledChecks: 0,
    });
  });

  it('derives NEVER_RUN versus ALL_DISABLED from the current effective config', () => {
    expect(createNoRunDataQualitySummary(3)).toEqual({
      state: DataQualitySummaryState.NEVER_RUN,
      dataMartRunId: null,
      lastRunAt: null,
      enabledChecks: 3,
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      notApplicableChecks: 0,
      errorChecks: 0,
      noticeFindings: 0,
      warningFindings: 0,
      errorFindings: 0,
      violationCount: 0,
      highestSeverity: null,
    });
    expect(createNoRunDataQualitySummary(0).state).toBe(DataQualitySummaryState.ALL_DISABLED);
  });
});
