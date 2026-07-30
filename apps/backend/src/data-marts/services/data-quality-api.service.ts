import { ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { RunType } from '../../common/scheduler/shared/types';
import { AuthorizationContext } from '../../idp';
import {
  BatchRunDataQualityResponseApiDto,
  DataQualityBatchErrorCode,
  DataQualityBatchRunErrorApiDto,
  DataQualityConfigResponseApiDto,
  DataQualityConfigSource,
  GetDataQualitySummariesResponseApiDto,
  DataQualityRunEligibilityApiDto,
  DataQualityRunEligibilityCode,
  LatestDataQualityRunResponseApiDto,
  RunDataQualityRequestApiDto,
  RunDataQualityResponseApiDto,
} from '../dto/presentation/data-quality-api.dto';
import { DataQualityApiMapper } from '../mappers/data-quality-api.mapper';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { AccessDecisionService, Action, EntityType } from './access-decision';
import { DataMartService } from './data-mart.service';
import {
  DataQualityConfig,
  EffectiveDataQualityConfig,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRunService } from './data-quality-run.service';
import { DataQualityRunRequestService } from './data-quality-run-request.service';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataQualityRelationshipSnapshot } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataQualitySummaryService } from './data-quality-summary.service';

const BATCH_CONCURRENCY = 8;
const NOT_FOUND_OR_FORBIDDEN_MESSAGE = 'Data Mart was not found or is not accessible';

@Injectable()
export class DataQualityApiService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly runService: DataQualityRunService,
    private readonly runRequestService: DataQualityRunRequestService,
    private readonly mapper: DataQualityApiMapper,
    private readonly summaryService: DataQualitySummaryService
  ) {}

  async getConfig(
    context: AuthorizationContext,
    dataMartId: string
  ): Promise<DataQualityConfigResponseApiDto> {
    const dataMart = await this.requireAccess(context, dataMartId, Action.SEE);
    const [state, canEdit, activeRunId] = await Promise.all([
      this.runService.getConfig(dataMartId, context.projectId),
      this.canAccess(context, dataMartId, Action.EDIT),
      this.runService.getActiveRunId(dataMartId),
    ]);
    const targetAccess = await this.getRelationshipTargetAccess(
      context,
      state.relationshipSnapshots.map(snapshot => snapshot.targetDataMartId)
    );
    const effectiveConfig = applyRelationshipTargetAccess(
      state.effectiveConfig,
      state.relationshipSnapshots,
      targetAccess
    );
    const runEligibility = getRunEligibility(dataMart, effectiveConfig, activeRunId);
    return {
      source:
        state.savedConfig === null
          ? DataQualityConfigSource.DEFAULT
          : DataQualityConfigSource.SAVED,
      savedConfig: state.savedConfig,
      effectiveConfig,
      configRevision: state.configRevision,
      relationships: toRelationshipMetadata(state.relationshipSnapshots),
      canEdit,
      canRun: canEdit && runEligibility.eligible,
      runEligibility,
    };
  }

  async replaceConfig(
    context: AuthorizationContext,
    dataMartId: string,
    config: DataQualityConfig | null
  ): Promise<DataQualityConfigResponseApiDto> {
    const dataMart = await this.requireAccess(context, dataMartId, Action.EDIT);
    const state = await this.runService.replaceConfig(dataMartId, context.projectId, config);
    const activeRunId = await this.runService.getActiveRunId(dataMartId);
    const targetAccess = await this.getRelationshipTargetAccess(
      context,
      state.relationshipSnapshots.map(snapshot => snapshot.targetDataMartId)
    );
    const effectiveConfig = applyRelationshipTargetAccess(
      state.effectiveConfig,
      state.relationshipSnapshots,
      targetAccess
    );
    const runEligibility = getRunEligibility(dataMart, effectiveConfig, activeRunId);
    return {
      source:
        state.savedConfig === null
          ? DataQualityConfigSource.DEFAULT
          : DataQualityConfigSource.SAVED,
      savedConfig: state.savedConfig,
      effectiveConfig,
      configRevision: state.configRevision,
      relationships: toRelationshipMetadata(state.relationshipSnapshots),
      canEdit: true,
      canRun: runEligibility.eligible,
      runEligibility,
    };
  }

  async run(
    context: AuthorizationContext,
    dataMartId: string,
    request?: RunDataQualityRequestApiDto
  ): Promise<RunDataQualityResponseApiDto> {
    await this.requireAccess(context, dataMartId, Action.EDIT);
    const result = request?.configRevision
      ? await this.runRequestService.enqueue(
          context,
          dataMartId,
          RunType.manual,
          request.configRevision
        )
      : await this.runRequestService.enqueue(context, dataMartId, RunType.manual);
    return { runId: result.dataMartRunId };
  }

  async runBatch(
    context: AuthorizationContext,
    requestedIds: readonly string[]
  ): Promise<BatchRunDataQualityResponseApiDto> {
    const ids = Array.from(new Set(requestedIds));
    const existing = await this.dataMartService.findByIdsAndProjectId(ids, context.projectId);
    const existingIds = existing.map(dataMart => dataMart.id);
    const editAccess = await this.getAccessMany(context, existingIds, Action.EDIT);

    const items = await mapWithConcurrency(ids, BATCH_CONCURRENCY, async dataMartId => {
      if (!editAccess.get(dataMartId)) {
        return notFoundOrForbidden(dataMartId);
      }
      try {
        const result = await this.runRequestService.enqueue(context, dataMartId, RunType.manual);
        return { dataMartId, status: 'SUCCESS' as const, runId: result.dataMartRunId };
      } catch (error) {
        return toBatchError(dataMartId, error);
      }
    });

    return { items };
  }

  async getSummaries(
    context: AuthorizationContext,
    requestedIds: readonly string[]
  ): Promise<GetDataQualitySummariesResponseApiDto> {
    const ids = Array.from(new Set(requestedIds));
    const existing = await this.dataMartService.findByIdsAndProjectId(ids, context.projectId);
    const existingIds = new Set(existing.map(dataMart => dataMart.id));
    const projectScopedIds = ids.filter(id => existingIds.has(id));
    const seeAccess = await this.getAccessMany(context, projectScopedIds, Action.SEE);
    const visibleIds = projectScopedIds.filter(id => seeAccess.get(id) === true);
    const summaries = await this.summaryService.getCurrentByDataMartIds(
      visibleIds,
      context.projectId
    );

    return {
      items: visibleIds.flatMap(dataMartId => {
        const summary = summaries.get(dataMartId);
        return summary ? [{ dataMartId, summary }] : [];
      }),
    };
  }

  async getLatest(
    context: AuthorizationContext,
    dataMartId: string
  ): Promise<LatestDataQualityRunResponseApiDto | null> {
    await this.requireAccess(context, dataMartId, Action.SEE);
    const run = await this.runService.getLatest(dataMartId);
    return run ? this.mapper.toLatestResponse(run) : null;
  }

  private async requireAccess(
    context: AuthorizationContext,
    dataMartId: string,
    action: Action
  ): Promise<DataMart> {
    // Project-scoped root lookup always happens before access evaluation, preventing
    // cross-tenant identifiers from being evaluated as in-project resources.
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, context.projectId);
    if (!(await this.canAccess(context, dataMartId, action))) {
      throw new ForbiddenException(`You do not have ${action} access to this Data Mart`);
    }
    return dataMart;
  }

  private canAccess(
    context: AuthorizationContext,
    dataMartId: string,
    action: Action
  ): Promise<boolean> {
    return this.accessDecisionService.canAccess(
      context.userId,
      context.roles ?? [],
      EntityType.DATA_MART,
      dataMartId,
      action,
      context.projectId
    );
  }

  private getAccessMany(
    context: AuthorizationContext,
    dataMartIds: readonly string[],
    action: Action
  ): Promise<Map<string, boolean>> {
    if (dataMartIds.length === 0) return Promise.resolve(new Map());
    return this.accessDecisionService.canAccessMany(
      context.userId,
      context.roles ?? [],
      EntityType.DATA_MART,
      dataMartIds,
      action,
      context.projectId
    );
  }

  private getRelationshipTargetAccess(
    context: AuthorizationContext,
    targetIds: readonly string[]
  ): Promise<Map<string, boolean>> {
    return this.getAccessMany(context, Array.from(new Set(targetIds)), Action.SEE);
  }
}

function applyRelationshipTargetAccess(
  config: EffectiveDataQualityConfig,
  relationships: DataQualityRelationshipSnapshot[],
  accessByTargetId: ReadonlyMap<string, boolean>
): EffectiveDataQualityConfig {
  const targetIdByRelationshipId = new Map(
    relationships.map(relationship => [relationship.id, relationship.targetDataMartId])
  );
  return {
    ...config,
    rules: config.rules.map(rule => {
      if (rule.scope.type !== DataQualityScope.RELATIONSHIP) return rule;
      const targetId = targetIdByRelationshipId.get(rule.scope.relationshipId);
      if (targetId && accessByTargetId.get(targetId) === true) return rule;
      return {
        ...rule,
        isApplicable: false,
        notApplicableReason: 'Relationship target is not accessible',
      };
    }),
  };
}

function toRelationshipMetadata(relationships: readonly DataQualityRelationshipSnapshot[]) {
  return relationships.map(relationship => ({
    id: relationship.id,
    targetAlias: relationship.targetAlias,
    joinConditions: relationship.joinConditions.map(condition => ({
      sourceFieldName: condition.sourceFieldName,
      targetFieldName: condition.targetFieldName,
    })),
  }));
}

function getRunEligibility(
  dataMart: DataMart,
  config: EffectiveDataQualityConfig,
  activeRunId: string | null
): DataQualityRunEligibilityApiDto {
  if (dataMart.status !== DataMartStatus.PUBLISHED) {
    return ineligible(DataQualityRunEligibilityCode.NOT_PUBLISHED);
  }
  if (!dataMart.schema) {
    return ineligible(DataQualityRunEligibilityCode.OUTPUT_SCHEMA_REQUIRED);
  }
  if (!dataMart.definition || !dataMart.definitionType) {
    return ineligible(DataQualityRunEligibilityCode.DEFINITION_REQUIRED);
  }
  if (!config.rules.some(rule => rule.enabled && rule.isApplicable)) {
    return ineligible(DataQualityRunEligibilityCode.NO_APPLICABLE_CHECKS);
  }
  if (activeRunId) {
    return {
      eligible: false,
      code: DataQualityRunEligibilityCode.ACTIVE_RUN,
      activeRunId,
    };
  }
  return { eligible: true, code: null, activeRunId: null };
}

function ineligible(code: DataQualityRunEligibilityCode): DataQualityRunEligibilityApiDto {
  return { eligible: false, code, activeRunId: null };
}

function notFoundOrForbidden(dataMartId: string): DataQualityBatchRunErrorApiDto {
  return {
    dataMartId,
    status: 'ERROR',
    code: DataQualityBatchErrorCode.NOT_FOUND_OR_FORBIDDEN,
    message: NOT_FOUND_OR_FORBIDDEN_MESSAGE,
  };
}

function toBatchError(dataMartId: string, error: unknown): DataQualityBatchRunErrorApiDto {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const body = typeof response === 'object' && response !== null ? response : {};
    const code = 'code' in body && typeof body.code === 'string' ? body.code : null;
    const activeRunId =
      'activeRunId' in body && typeof body.activeRunId === 'string' ? body.activeRunId : null;
    if (code === 'DATA_QUALITY_RUN_ACTIVE') {
      return {
        dataMartId,
        status: 'ERROR',
        code: DataQualityBatchErrorCode.ACTIVE_RUN,
        message: 'A Data Quality run is already active',
        activeRunId,
      };
    }
    if (code?.startsWith('DATA_QUALITY_')) {
      return {
        dataMartId,
        status: 'ERROR',
        code: DataQualityBatchErrorCode.NOT_ELIGIBLE,
        message: 'Data Mart is not eligible for a Data Quality run',
      };
    }
    if (error.getStatus() === 403 || error.getStatus() === 404) {
      return notFoundOrForbidden(dataMartId);
    }
  }
  return {
    dataMartId,
    status: 'ERROR',
    code: DataQualityBatchErrorCode.INTERNAL_ERROR,
    message: 'Data Quality run could not be created',
  };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
