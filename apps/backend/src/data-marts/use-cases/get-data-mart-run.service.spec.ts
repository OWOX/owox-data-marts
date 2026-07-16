import { NotFoundException } from '@nestjs/common';
import { GetDataMartRunCommand } from '../dto/domain/get-data-mart-run.command';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataQualityApiMapper } from '../mappers/data-quality-api.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { GetDataMartRunService } from './get-data-mart-run.service';

describe('GetDataMartRunService', () => {
  const command = new GetDataMartRunCommand('dm-1', 'project-1', 'run-1', 'user-1', ['viewer']);

  function createService() {
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'dm-1' }),
    };
    const dataMartRunService = {
      getByIdAndDataMartId: jest.fn().mockResolvedValue(qualityRun()),
    };
    const userProjectionsFetcherService = {
      fetchCreatedByUser: jest.fn().mockResolvedValue({ id: 'creator-1' }),
    };
    const mapper = {
      toDataMartRunDto: jest.fn(
        (run: DataMartRun, createdByUser: unknown, dataQuality: unknown) => ({
          id: run.id,
          dataMartId: run.dataMartId,
          createdByUser,
          dataQuality,
        })
      ),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
      canAccessMany: jest.fn().mockResolvedValue(new Map([['target-1', false]])),
    };
    const dataQualityApiMapper = new DataQualityApiMapper();
    const service = new GetDataMartRunService(
      dataMartService as unknown as DataMartService,
      dataMartRunService as unknown as DataMartRunService,
      userProjectionsFetcherService as unknown as UserProjectionsFetcherService,
      mapper as unknown as DataMartMapper,
      accessDecisionService as unknown as AccessDecisionService,
      dataQualityApiMapper
    );

    return {
      service,
      dataMartService,
      dataMartRunService,
      userProjectionsFetcherService,
      mapper,
      accessDecisionService,
    };
  }

  it('returns full DQ data through generic detail and redacts an inaccessible target', async () => {
    const { service, mapper, accessDecisionService } = createService();

    const response = await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      EntityType.DATA_MART,
      'dm-1',
      Action.SEE,
      'project-1'
    );
    expect(accessDecisionService.canAccessMany).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      EntityType.DATA_MART,
      ['target-1'],
      Action.SEE,
      'project-1'
    );
    expect(mapper.toDataMartRunDto).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'run-1' }),
      { id: 'creator-1' },
      expect.objectContaining({
        snapshot: expect.any(Object),
        summary: expect.objectContaining({ state: DataQualitySummaryState.ISSUES }),
        results: [
          expect.objectContaining({
            violationCount: 2,
            examples: [],
            executedSql: [],
            reproductionSql: null,
            redacted: true,
          }),
        ],
      })
    );
    expect(response.dataQuality).toMatchObject({
      snapshot: expect.any(Object),
      summary: expect.any(Object),
      results: [expect.objectContaining({ redacted: true })],
    });
  });

  it('does not return a run id belonging to another Data Mart', async () => {
    const { service, dataMartRunService, accessDecisionService } = createService();
    dataMartRunService.getByIdAndDataMartId.mockResolvedValue(null);

    await expect(service.run(command)).rejects.toBeInstanceOf(NotFoundException);

    expect(dataMartRunService.getByIdAndDataMartId).toHaveBeenCalledWith('run-1', 'dm-1');
    expect(accessDecisionService.canAccessMany).not.toHaveBeenCalled();
  });

  it('stops at the project-scoped Data Mart lookup for another project', async () => {
    const { service, dataMartService, dataMartRunService, accessDecisionService } = createService();
    dataMartService.getByIdAndProjectId.mockRejectedValue(new NotFoundException('Data Mart'));

    await expect(service.run(command)).rejects.toBeInstanceOf(NotFoundException);

    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('dm-1', 'project-1');
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(dataMartRunService.getByIdAndDataMartId).not.toHaveBeenCalled();
  });

  function qualityRun(): DataMartRun {
    return {
      id: 'run-1',
      dataMartId: 'dm-1',
      type: DataMartRunType.DATA_QUALITY,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      startedAt: new Date('2026-01-01T00:00:01.000Z'),
      finishedAt: new Date('2026-01-01T00:00:02.000Z'),
      dataQualitySnapshot: {
        config: { timezone: 'UTC', rules: [] },
        schema: null,
        relationships: [
          {
            id: 'rel-1',
            sourceDataMartId: 'dm-1',
            targetDataMartId: 'target-1',
            targetAlias: 'target',
            joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
          },
        ],
        timezone: 'UTC',
        definitionType: DataMartDefinitionType.TABLE,
      },
      dataQualitySummary: {
        state: DataQualitySummaryState.ISSUES,
        enabledChecks: 1,
        totalChecks: 1,
        passedChecks: 0,
        failedChecks: 1,
        notApplicableChecks: 0,
        errorChecks: 0,
        noticeFindings: 0,
        warningFindings: 1,
        errorFindings: 0,
        violationCount: 2,
        highestSeverity: DataQualitySeverity.WARNING,
      },
      dataQualityResults: [
        {
          id: 'result-1',
          ruleKey: 'relationship_integrity:relationship:rel-1',
          category: DataQualityCategory.RELATIONSHIP_INTEGRITY,
          scope: { type: DataQualityScope.RELATIONSHIP, relationshipId: 'rel-1' },
          severity: DataQualitySeverity.WARNING,
          status: DataQualityCheckStatus.FAILED,
          violationCount: 2,
          description: 'orphans',
          examples: [{ values: { id: 1 } }],
          executedSql: ['SELECT secret'],
          reproductionSql: 'SELECT secret',
          error: null,
          createdAt: '2026-01-01T00:00:02.000Z',
        },
      ],
    } as unknown as DataMartRun;
  }
});
