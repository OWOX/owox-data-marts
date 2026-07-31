import { Injectable } from '@nestjs/common';
import { RunType } from '../../common/scheduler/shared/types';
import type { AuthorizationContext } from '../../idp';
import type { DataQualityRelationshipSnapshot } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { AccessDecisionService, Action, EntityType } from './access-decision';
import type { DataQualityConfigState, EnqueuedDataQualityRun } from './data-quality-run.service';
import { DataQualityRunService } from './data-quality-run.service';

@Injectable()
export class DataQualityRunRequestService {
  constructor(
    private readonly runService: DataQualityRunService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async enqueue(
    context: AuthorizationContext,
    dataMartId: string,
    runType: RunType,
    expectedConfigRevision?: string
  ): Promise<EnqueuedDataQualityRun> {
    const state = await this.runService.getConfig(dataMartId, context.projectId);
    const relationshipTargetAccess = await this.resolveRelationshipTargetAccess(
      context,
      state.relationshipSnapshots
    );

    return this.runService.enqueue({
      dataMartId,
      projectId: context.projectId,
      createdById: context.userId,
      runType,
      relationshipTargetAccess,
      ...(expectedConfigRevision ? { expectedConfigRevision } : {}),
    });
  }

  async hasApplicableEnabledChecks(
    context: AuthorizationContext,
    dataMartId: string
  ): Promise<boolean> {
    const state = await this.runService.getConfig(dataMartId, context.projectId);
    const relationshipTargetAccess = await this.resolveRelationshipTargetAccess(
      context,
      state.relationshipSnapshots
    );
    const targetIdByRelationshipId = new Map(
      state.relationshipSnapshots.map(relationship => [
        relationship.id,
        relationship.targetDataMartId,
      ])
    );

    return state.effectiveConfig.rules.some(rule => {
      if (!rule.enabled || !rule.isApplicable) return false;
      if (rule.scope.type !== DataQualityScope.RELATIONSHIP) return true;
      const targetId = targetIdByRelationshipId.get(rule.scope.relationshipId);
      return targetId !== undefined && relationshipTargetAccess.get(targetId) === true;
    });
  }

  private resolveRelationshipTargetAccess(
    context: AuthorizationContext,
    relationships: DataQualityConfigState['relationshipSnapshots']
  ): Promise<Map<string, boolean>> {
    const targetIds = uniqueRelationshipTargetIds(relationships);
    if (targetIds.length === 0) return Promise.resolve(new Map());

    return this.accessDecisionService.canAccessMany(
      context.userId,
      context.roles ?? [],
      EntityType.DATA_MART,
      targetIds,
      Action.SEE,
      context.projectId
    );
  }
}

function uniqueRelationshipTargetIds(
  relationships: readonly DataQualityRelationshipSnapshot[]
): string[] {
  return Array.from(new Set(relationships.map(relationship => relationship.targetDataMartId)));
}
