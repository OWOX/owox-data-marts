import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RunType } from '../../common/scheduler/shared/types';
import { AuthorizationContext } from '../../idp';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataMart } from '../entities/data-mart.entity';
import { AccessDecisionService, Action, EntityType } from './access-decision';
import { DataMartService } from './data-mart.service';
import { DataQualityApiService } from './data-quality-api.service';
import { DataQualityRunService } from './data-quality-run.service';
import { DataQualityRunRequestService } from './data-quality-run-request.service';
import {
  DataQualityBatchErrorCode,
  DataQualityConfigSource,
} from '../dto/presentation/data-quality-api.dto';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataQualityApiMapper } from '../mappers/data-quality-api.mapper';
import { DataQualitySummaryService } from './data-quality-summary.service';
import { createNoRunDataQualitySummary } from './data-quality-summary.service';

describe('DataQualityApiService', () => {
  const configRevision = 'a'.repeat(64);
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
  } as unknown as DataMart;
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
    getActiveRunId: jest.fn(),
  };
  const runRequestService = {
    enqueue: jest.fn(),
  };
  const dataQualitySummaryService = {
    getCurrentByDataMarts: jest.fn(),
    getCurrentByDataMartIds: jest.fn(),
  };
  const service = new DataQualityApiService(
    dataMartService as unknown as DataMartService,
    accessDecisionService as unknown as AccessDecisionService,
    runService as unknown as DataQualityRunService,
    runRequestService as unknown as DataQualityRunRequestService,
    new DataQualityApiMapper(),
    dataQualitySummaryService as unknown as DataQualitySummaryService
  );

  const effectiveConfig = {
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
  const relationshipEffectiveConfig = {
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
  };
  const configState = {
    savedConfig: null,
    effectiveConfig,
    configRevision,
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
    runService.replaceConfig.mockResolvedValue(configState);
    runService.enqueue.mockResolvedValue({ dataMartRunId: 'run-1' });
    runRequestService.enqueue.mockResolvedValue({ dataMartRunId: 'run-1' });
    runService.getActiveRunId.mockResolvedValue(null);
    dataQualitySummaryService.getCurrentByDataMarts.mockResolvedValue(new Map());
    dataQualitySummaryService.getCurrentByDataMartIds.mockResolvedValue(new Map());
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
      configRevision,
      canEdit: true,
      canRun: true,
      runEligibility: { eligible: true, code: null, activeRunId: null },
    });
    expect(response.relationships).toEqual([
      {
        id: 'rel-1',
        targetAlias: 'target',
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      },
    ]);
  });

  it('returns the same minimal relationship metadata after replacing config', async () => {
    runService.replaceConfig.mockResolvedValueOnce({
      ...configState,
      effectiveConfig: relationshipEffectiveConfig,
    });
    accessDecisionService.canAccessMany.mockResolvedValueOnce(new Map([['target-1', false]]));

    const response = await service.replaceConfig(context, 'dm-1', null);

    expect(runService.replaceConfig).toHaveBeenCalledWith('dm-1', 'project-1', null);
    expect(runService.getConfig).not.toHaveBeenCalled();
    expect(response.configRevision).toBe(configRevision);
    expect(response.effectiveConfig.rules[0]).toMatchObject({
      isApplicable: false,
      notApplicableReason: 'Relationship target is not accessible',
    });
    expect(response.relationships).toEqual([
      {
        id: 'rel-1',
        targetAlias: 'target',
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      },
    ]);
    expect(response.relationships[0]).not.toHaveProperty('sourceDataMartId');
    expect(response.relationships[0]).not.toHaveProperty('targetDataMartId');
    expect(response.relationships[0]).not.toHaveProperty('targetAccessible');
  });

  it('returns the same privilege-neutral revision regardless of relationship target access', async () => {
    runService.getConfig.mockResolvedValue({
      ...configState,
      effectiveConfig: relationshipEffectiveConfig,
    });
    const editorResponse = await service.getConfig(context, 'dm-1');
    accessDecisionService.canAccessMany.mockResolvedValueOnce(new Map([['target-1', false]]));

    const restrictedResponse = await service.getConfig(
      { ...context, userId: 'restricted-user', roles: ['viewer'] } as AuthorizationContext,
      'dm-1'
    );

    expect(editorResponse.effectiveConfig.rules[0]).toMatchObject({ isApplicable: true });
    expect(restrictedResponse.effectiveConfig.rules[0]).toMatchObject({
      isApplicable: false,
      notApplicableReason: 'Relationship target is not accessible',
    });
    expect(restrictedResponse.configRevision).toBe(editorResponse.configRevision);
    expect(restrictedResponse.configRevision).toBe(configRevision);
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

  it('requires EDIT and delegates a manual run through the shared request service', async () => {
    await expect(service.run(context, 'dm-1')).resolves.toEqual({
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
    expect(runRequestService.enqueue).toHaveBeenCalledWith(context, 'dm-1', RunType.manual);
  });

  it('passes an expected revision only for a revision-bound manual run', async () => {
    await service.run(context, 'dm-1', { configRevision });

    expect(runRequestService.enqueue).toHaveBeenCalledWith(
      context,
      'dm-1',
      RunType.manual,
      configRevision
    );
  });

  it('returns a typed non-leaking, stable partial batch result', async () => {
    dataMartService.findByIdsAndProjectId.mockResolvedValue([{ id: 'dm-a' }, { id: 'dm-c' }]);
    accessDecisionService.canAccessMany.mockResolvedValueOnce(
      new Map([
        ['dm-a', true],
        ['dm-c', true],
      ])
    );
    runRequestService.enqueue
      .mockResolvedValueOnce({ dataMartRunId: 'run-a' })
      .mockRejectedValueOnce(
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

  it('returns summaries only for project-scoped Data Marts the caller can see', async () => {
    const dmA = { id: 'dm-a' } as DataMart;
    const dmC = { id: 'dm-c' } as DataMart;
    const summaryA = createNoRunDataQualitySummary(2);
    dataMartService.findByIdsAndProjectId.mockResolvedValue([dmA, dmC]);
    accessDecisionService.canAccessMany.mockResolvedValueOnce(
      new Map([
        ['dm-a', true],
        ['dm-c', false],
      ])
    );
    dataQualitySummaryService.getCurrentByDataMartIds.mockResolvedValueOnce(
      new Map([['dm-a', summaryA]])
    );

    await expect(
      service.getSummaries(context, ['dm-a', 'missing-or-foreign', 'dm-c'])
    ).resolves.toEqual({
      items: [{ dataMartId: 'dm-a', summary: summaryA }],
    });

    expect(dataMartService.findByIdsAndProjectId).toHaveBeenCalledWith(
      ['dm-a', 'missing-or-foreign', 'dm-c'],
      'project-1'
    );
    expect(accessDecisionService.canAccessMany).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      ['dm-a', 'dm-c'],
      Action.SEE,
      'project-1'
    );
    expect(dataQualitySummaryService.getCurrentByDataMartIds).toHaveBeenCalledWith(
      ['dm-a'],
      'project-1'
    );
    expect(dataQualitySummaryService.getCurrentByDataMarts).not.toHaveBeenCalled();
  });
});
