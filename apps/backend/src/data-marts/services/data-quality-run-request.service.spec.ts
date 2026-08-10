import { RunType } from '../../common/scheduler/shared/types';
import { AuthorizationContext } from '../../idp';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { AccessDecisionService, Action, EntityType } from './access-decision';
import { DataQualityRunRequestService } from './data-quality-run-request.service';
import { DataQualityRunService } from './data-quality-run.service';

describe('DataQualityRunRequestService', () => {
  const context = {
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['editor'],
  } as AuthorizationContext;

  const relationshipSnapshots = [
    {
      id: 'relationship-1',
      sourceDataMartId: 'data-mart-1',
      targetDataMartId: 'target-1',
      targetAlias: 'customers',
      joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
    },
    {
      id: 'relationship-2',
      sourceDataMartId: 'data-mart-1',
      targetDataMartId: 'target-1',
      targetAlias: 'customer_profiles',
      joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
    },
  ];

  const relationshipRule = {
    key: 'relationship_integrity:relationship:relationship-1',
    category: DataQualityCategory.RELATIONSHIP_INTEGRITY,
    scope: {
      type: DataQualityScope.RELATIONSHIP,
      relationshipId: 'relationship-1',
    },
    severity: DataQualitySeverity.WARNING,
    enabled: true,
    parameters: {},
    isApplicable: true,
  };

  const createService = () => {
    const runService = {
      getConfig: jest.fn().mockResolvedValue({
        savedConfig: null,
        effectiveConfig: { rules: [relationshipRule] },
        relationshipSnapshots,
      }),
      enqueue: jest.fn().mockResolvedValue({ dataMartRunId: 'run-1' }),
    };
    const accessDecisionService = {
      canAccessMany: jest.fn().mockResolvedValue(new Map([['target-1', true]])),
    };
    const service = new DataQualityRunRequestService(
      runService as unknown as DataQualityRunService,
      accessDecisionService as unknown as AccessDecisionService
    );

    return { service, runService, accessDecisionService };
  };

  it('enqueues a scheduled run with current deduplicated relationship target access', async () => {
    const { service, runService, accessDecisionService } = createService();

    await expect(service.enqueue(context, 'data-mart-1', RunType.scheduled)).resolves.toEqual({
      dataMartRunId: 'run-1',
    });

    expect(accessDecisionService.canAccessMany).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      ['target-1'],
      Action.SEE,
      'project-1'
    );
    expect(runService.enqueue).toHaveBeenCalledWith({
      dataMartId: 'data-mart-1',
      projectId: 'project-1',
      createdById: 'user-1',
      runType: RunType.scheduled,
      relationshipTargetAccess: new Map([['target-1', true]]),
    });
  });

  it('does not query access decisions when the Data Mart has no relationships', async () => {
    const { service, runService, accessDecisionService } = createService();
    runService.getConfig.mockResolvedValue({
      savedConfig: null,
      effectiveConfig: {
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
      },
      relationshipSnapshots: [],
    });

    await service.enqueue(context, 'data-mart-1', RunType.manual);

    expect(accessDecisionService.canAccessMany).not.toHaveBeenCalled();
    expect(runService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ relationshipTargetAccess: new Map() })
    );
  });

  it('forwards an expected revision only when one is supplied', async () => {
    const { service, runService } = createService();
    const configRevision = 'a'.repeat(64);

    await service.enqueue(context, 'data-mart-1', RunType.manual, configRevision);

    expect(runService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ expectedConfigRevision: configRevision })
    );
  });

  it('reports relationship-only checks as inapplicable when the target cannot be seen', async () => {
    const { service, accessDecisionService } = createService();
    accessDecisionService.canAccessMany.mockResolvedValue(new Map([['target-1', false]]));

    await expect(service.hasApplicableEnabledChecks(context, 'data-mart-1')).resolves.toBe(false);
  });

  it('keeps non-relationship checks applicable without target access', async () => {
    const { service, runService, accessDecisionService } = createService();
    runService.getConfig.mockResolvedValue({
      savedConfig: null,
      effectiveConfig: {
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
      },
      relationshipSnapshots,
    });
    accessDecisionService.canAccessMany.mockResolvedValue(new Map([['target-1', false]]));

    await expect(service.hasApplicableEnabledChecks(context, 'data-mart-1')).resolves.toBe(true);
  });
});
