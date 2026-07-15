import { Repository } from 'typeorm';
import { DataQualityRun } from '../entities/data-quality-run.entity';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import {
  DataQualitySummaryService,
  createNoRunDataQualitySummary,
} from './data-quality-summary.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';

describe('DataQualitySummaryService', () => {
  const qb = {
    innerJoinAndSelect: jest.fn(),
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
  } as unknown as Repository<DataQualityRun>;
  const relationshipService = {
    findGraphEdgesByProjectIdAndSourceDataMartIds: jest.fn(),
  } as unknown as DataMartRelationshipService;
  const service = new DataQualitySummaryService(repository, relationshipService);

  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(qb).forEach(mock => {
      if (typeof mock === 'function' && mock !== qb.getMany) mock.mockReturnValue(qb);
    });
  });

  it('uses the creation-ordered run id when two runs have the same createdAt', async () => {
    qb.getMany.mockResolvedValue([
      {
        summary: {
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
        dataMartRun: {
          id: 'run-b',
          dataMartId: 'dm-b',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          startedAt: new Date('2026-01-01T00:01:00Z'),
          finishedAt: new Date('2026-01-01T00:02:00Z'),
        },
      },
    ]);

    const result = await service.getLatestByDataMartIds(['dm-a', 'dm-b'], 'project-1');

    expect(result.get('dm-b')).toMatchObject({
      dataMartRunId: 'run-b',
      lastRunAt: new Date('2026-01-01T00:02:00Z'),
      state: DataQualitySummaryState.ISSUES,
    });
    expect(qb.getMany).toHaveBeenCalledTimes(1);
    expect(qb.leftJoin).toHaveBeenCalledWith(
      expect.any(Function),
      'newerRun',
      expect.stringContaining('newerRun.createdAt = dataMartRun.createdAt')
    );
    expect(qb.leftJoin).toHaveBeenCalledWith(
      expect.any(Function),
      'newerRun',
      expect.stringContaining('newerRun.id > dataMartRun.id')
    );
    expect(qb.andWhere).toHaveBeenCalledWith('dataMart.projectId = :projectId');
    expect(qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('createdAt >='));
  });

  it('skips the query for an empty page', async () => {
    await expect(service.getLatestByDataMartIds([], 'project-1')).resolves.toEqual(new Map());
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
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
          dataQualityConfig: { timezone: 'UTC', rules: [] },
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
