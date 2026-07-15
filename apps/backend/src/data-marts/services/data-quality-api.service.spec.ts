import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RunType } from '../../common/scheduler/shared/types';
import { AuthorizationContext } from '../../idp';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataMart } from '../entities/data-mart.entity';
import { DataQualityRun } from '../entities/data-quality-run.entity';
import { AccessDecisionService, Action, EntityType } from './access-decision';
import { DataMartService } from './data-mart.service';
import { DataQualityApiService } from './data-quality-api.service';
import { DataQualityRunService } from './data-quality-run.service';
import {
  DataQualityBatchErrorCode,
  DataQualityConfigSource,
} from '../dto/presentation/data-quality-api.dto';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';

describe('DataQualityApiService', () => {
  const context = {
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['editor'],
  } as AuthorizationContext;
  const dataMart = {
    id: 'dm-1',
    projectId: 'project-1',
    status: DataMartStatus.PUBLISHED,
    schema: { fields: [] },
    definitionType: DataMartDefinitionType.TABLE,
    definition: { fullyQualifiedName: 'project.dataset.table' },
  } as DataMart;
  const dataMartService = {
    getByIdAndProjectId: jest.fn(),
    findByIdsAndProjectId: jest.fn(),
  };
  const accessDecisionService = {
    canAccess: jest.fn(),
    canAccessMany: jest.fn(),
  };
  const runService = {
    getConfig: jest.fn(),
    replaceConfig: jest.fn(),
    enqueue: jest.fn(),
    getLatest: jest.fn(),
    getDetail: jest.fn(),
    getActiveRunId: jest.fn(),
  };
  const service = new DataQualityApiService(
    dataMartService as unknown as DataMartService,
    accessDecisionService as unknown as AccessDecisionService,
    runService as unknown as DataQualityRunService
  );

  const effectiveConfig = {
    timezone: 'UTC',
    rules: [
      {
        key: 'empty_table:data_mart',
        category: DataQualityCategory.EMPTY_TABLE,
        scope: { type: DataQualityScope.DATA_MART },
        severity: DataQualitySeverity.ERROR,
        enabled: true,
        parameters: {},
        isApplicable: true,
      },
    ],
  };
  const configState = {
    savedConfig: null,
    effectiveConfig,
    relationshipSnapshots: [
      {
        id: 'rel-1',
        sourceDataMartId: 'dm-1',
        targetDataMartId: 'target-1',
        targetAlias: 'target',
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      },
    ],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    dataMartService.getByIdAndProjectId.mockResolvedValue(dataMart);
    dataMartService.findByIdsAndProjectId.mockResolvedValue([dataMart]);
    accessDecisionService.canAccess.mockResolvedValue(true);
    accessDecisionService.canAccessMany.mockResolvedValue(new Map([['target-1', true]]));
    runService.getConfig.mockResolvedValue(configState);
    runService.replaceConfig.mockResolvedValue(effectiveConfig);
    runService.enqueue.mockResolvedValue({ dataMartRunId: 'run-1' });
    runService.getActiveRunId.mockResolvedValue(null);
  });

  it('resolves the project-scoped root before SEE and returns permissions', async () => {
    const response = await service.getConfig(context, 'dm-1');

    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('dm-1', 'project-1');
    expect(accessDecisionService.canAccess).toHaveBeenNthCalledWith(
      1,
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-1',
      Action.SEE,
      'project-1'
    );
    expect(response).toMatchObject({
      source: DataQualityConfigSource.DEFAULT,
      savedConfig: null,
      canEdit: true,
      canRun: true,
      runEligibility: { eligible: true, code: null, activeRunId: null },
    });
    expect(response.availableChecks).toEqual(
      expect.arrayContaining(Object.values(DataQualityCategory))
    );
  });

  it('makes canRun eligibility-aware for drafts, all-disabled configs, and active runs', async () => {
    dataMartService.getByIdAndProjectId.mockResolvedValueOnce({
      ...dataMart,
      status: DataMartStatus.DRAFT,
    });
    await expect(service.getConfig(context, 'dm-1')).resolves.toMatchObject({
      canEdit: true,
      canRun: false,
      runEligibility: { code: 'NOT_PUBLISHED' },
    });

    runService.getConfig.mockResolvedValueOnce({
      ...configState,
      effectiveConfig: {
        ...effectiveConfig,
        rules: effectiveConfig.rules.map(rule => ({ ...rule, enabled: false })),
      },
    });
    await expect(service.getConfig(context, 'dm-1')).resolves.toMatchObject({
      canRun: false,
      runEligibility: { code: 'NO_APPLICABLE_CHECKS' },
    });

    runService.getActiveRunId.mockResolvedValueOnce('active-run');
    await expect(service.getConfig(context, 'dm-1')).resolves.toMatchObject({
      canRun: false,
      runEligibility: { code: 'ACTIVE_RUN', activeRunId: 'active-run' },
    });
  });

  it('marks relationship rules not applicable when target SEE is denied', async () => {
    runService.getConfig.mockResolvedValue({
      ...configState,
      effectiveConfig: {
        timezone: 'UTC',
        rules: [
          {
            key: 'relationship_integrity:relationship:rel-1',
            category: DataQualityCategory.RELATIONSHIP_INTEGRITY,
            scope: { type: DataQualityScope.RELATIONSHIP, relationshipId: 'rel-1' },
            severity: DataQualitySeverity.WARNING,
            enabled: true,
            parameters: {},
            isApplicable: true,
          },
        ],
      },
    });
    accessDecisionService.canAccessMany.mockResolvedValue(new Map([['target-1', false]]));

    const response = await service.getConfig(context, 'dm-1');
    expect(response.effectiveConfig.rules[0]).toMatchObject({
      isApplicable: false,
      notApplicableReason: 'Relationship target is not accessible',
    });
    expect(response.canRun).toBe(false);
  });

  it('rejects a read when SEE is denied after root resolution', async () => {
    accessDecisionService.canAccess.mockResolvedValue(false);
    await expect(service.getConfig(context, 'dm-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(runService.getConfig).not.toHaveBeenCalled();
  });

  it('requires EDIT and passes one target-access map into enqueue', async () => {
    await expect(service.run(context, 'dm-1', { hasConfig: false })).resolves.toEqual({
      runId: 'run-1',
    });
    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-1',
      Action.EDIT,
      'project-1'
    );
    expect(accessDecisionService.canAccessMany).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      ['target-1'],
      Action.SEE,
      'project-1'
    );
    expect(runService.enqueue).toHaveBeenCalledWith({
      dataMartId: 'dm-1',
      projectId: 'project-1',
      createdById: 'user-1',
      runType: RunType.manual,
      relationshipTargetAccess: new Map([['target-1', true]]),
    });
  });

  it('redacts relationship SQL/examples without SEE on the target', async () => {
    accessDecisionService.canAccessMany.mockResolvedValue(new Map([['target-1', false]]));
    runService.getDetail.mockResolvedValue(qualityRun());

    const response = await service.getDetail(context, 'dm-1', 'run-1');

    expect(response.results[0]).toMatchObject({
      examples: [],
      executedSql: [],
      reproductionSql: null,
      violationCount: 2,
      status: DataQualityCheckStatus.FAILED,
      redacted: true,
    });
  });

  it('returns a typed non-leaking, stable partial batch result', async () => {
    dataMartService.findByIdsAndProjectId.mockResolvedValue([{ id: 'dm-a' }, { id: 'dm-c' }]);
    accessDecisionService.canAccessMany
      .mockResolvedValueOnce(
        new Map([
          ['dm-a', true],
          ['dm-c', true],
        ])
      )
      .mockResolvedValue(new Map());
    runService.getConfig.mockResolvedValue({ ...configState, relationshipSnapshots: [] });
    runService.enqueue.mockResolvedValueOnce({ dataMartRunId: 'run-a' }).mockRejectedValueOnce(
      new ConflictException({
        code: 'DATA_QUALITY_RUN_ACTIVE',
        activeRunId: 'active-c',
      })
    );

    const response = await service.runBatch(context, ['dm-a', 'dm-b', 'dm-c']);

    expect(response.items).toEqual([
      { dataMartId: 'dm-a', status: 'SUCCESS', runId: 'run-a' },
      {
        dataMartId: 'dm-b',
        status: 'ERROR',
        code: DataQualityBatchErrorCode.NOT_FOUND_OR_FORBIDDEN,
        message: 'Data Mart was not found or is not accessible',
      },
      {
        dataMartId: 'dm-c',
        status: 'ERROR',
        code: DataQualityBatchErrorCode.ACTIVE_RUN,
        message: 'A Data Quality run is already active',
        activeRunId: 'active-c',
      },
    ]);
  });

  it('returns 404 for a run outside the requested Data Mart', async () => {
    runService.getDetail.mockResolvedValue(null);
    await expect(service.getDetail(context, 'dm-1', 'other-run')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  function qualityRun(): DataQualityRun {
    return {
      id: 'quality-1',
      dataMartRunId: 'run-1',
      dataMartRun: {
        id: 'run-1',
        dataMartId: 'dm-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        startedAt: new Date('2026-01-01T00:00:01Z'),
        finishedAt: new Date('2026-01-01T00:00:02Z'),
      },
      configSnapshot: effectiveConfig,
      schemaSnapshot: null,
      relationshipSnapshots: configState.relationshipSnapshots,
      timezone: 'UTC',
      summary: {
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
      results: [
        {
          id: 'result-1',
          dataQualityRunId: 'quality-1',
          ruleKey: 'relationship_integrity:relationship:rel-1',
          category: DataQualityCategory.RELATIONSHIP_INTEGRITY,
          scope: { type: DataQualityScope.RELATIONSHIP, relationshipId: 'rel-1' },
          severity: DataQualitySeverity.WARNING,
          status: DataQualityCheckStatus.FAILED,
          violationCount: 2,
          description: 'orphans',
          examples: [{ values: { id: 1 } }],
          executedSql: ['select secret'],
          reproductionSql: 'select secret',
          errorCode: null,
          errorMessage: null,
          errorDetails: null,
          createdAt: new Date('2026-01-01T00:00:02Z'),
        },
      ],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      startedAt: new Date('2026-01-01T00:00:01Z'),
      finishedAt: new Date('2026-01-01T00:00:02Z'),
    } as DataQualityRun;
  }
});
