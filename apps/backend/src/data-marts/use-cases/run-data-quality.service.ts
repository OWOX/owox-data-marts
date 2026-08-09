import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import {
  DataQualityCheckCompiler,
  DataQualityCompiledCheck,
  DataQualityRelationshipCompileContext,
} from '../data-quality/data-quality-check-compiler';
import { DataQualityQueryExecutorService } from '../data-quality/data-quality-query-executor.service';
import {
  DataQualityParsedResult,
  DataQualityQueryExecution,
  DataQualityResultParser,
  aggregateDataQualitySummary,
} from '../data-quality/data-quality-result-parser';
import { QueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import {
  DataQualityMappedError,
  DataQualityRelationshipSnapshot,
  DataQualityRelationshipTargetSnapshot,
  DataQualityRunSnapshot,
  DataQualityStoredCheckResult,
} from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import {
  ProjectBillingService,
  RunKind,
} from '../services/project-billing/project-billing.service';
import { DATA_QUALITY_RUN_EXECUTION_ERROR_MESSAGE } from '../services/data-quality-run.service';
import {
  DataQualitySnapshotStorageMismatchError,
  DataQualitySnapshotTableReferenceInput,
  DataQualitySnapshotTableReferenceService,
} from '../data-quality/data-quality-snapshot-table-reference.service';

interface ClaimedDataQualityRun {
  dataMartRun: DataMartRun;
  dataMart: DataMart;
}

type DataQualityQueryResolver = (columns: string[]) => Promise<string | QueryBuildResult>;

interface ProviderErrorIdentity {
  code?: unknown;
  errorCode?: unknown;
  reason?: unknown;
}

const DATA_QUALITY_SOURCE_QUERY_ERROR_MESSAGE = 'Failed to resolve Data Quality source query';

class DataQualitySourceQueryError extends Error implements ProviderErrorIdentity {
  code?: unknown;
  errorCode?: unknown;
  reason?: unknown;

  constructor(cause: unknown) {
    super(DATA_QUALITY_SOURCE_QUERY_ERROR_MESSAGE, { cause });
    this.name = 'DataQualitySourceQueryError';
    if (typeof cause !== 'object' || cause === null) return;
    const identity = cause as ProviderErrorIdentity;
    this.code = identity.code;
    this.errorCode = identity.errorCode;
    this.reason = identity.reason;
  }
}

@Injectable()
export class RunDataQualityService {
  private readonly logger = new Logger(RunDataQualityService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    private readonly snapshotTableReference: DataQualitySnapshotTableReferenceService,
    private readonly compiler: DataQualityCheckCompiler,
    private readonly queryExecutor: DataQualityQueryExecutorService,
    private readonly resultParser: DataQualityResultParser,
    private readonly systemClock: SystemTimeService,
    private readonly projectBillingService: ProjectBillingService
  ) {}

  async executeExistingRun(
    dataMartRunId: string,
    expectedProjectId: string,
    signal?: AbortSignal
  ): Promise<void> {
    signal?.throwIfAborted();
    const claimed = await this.claimRun(dataMartRunId, expectedProjectId);
    if (!claimed) return;
    const { dataMartRun, dataMart } = claimed;
    const snapshot = dataMartRun.dataQualitySnapshot!;
    const enabledRules = snapshot.config.rules.filter(rule => rule.enabled);
    const persisted = dataMartRun.dataQualityResults ?? [];
    const persistedKeys = new Set(persisted.map(result => result.ruleKey));
    const parsedResults: DataQualityParsedResult[] = persisted.map(toParsedResult);
    const pendingRules = enabledRules.filter(rule => !persistedKeys.has(rule.key));

    try {
      signal?.throwIfAborted();
      if (pendingRules.length > 0) {
        await this.projectBillingService.verifyCanPerformOperations(
          dataMart.projectId,
          RunKind.DATA_QUALITY_RUN
        );
        const definitionRun = dataMartRun.definitionRun;
        if (!definitionRun) {
          throw new Error(
            `Data Quality definition snapshot for run ${dataMartRun.id} was not found`
          );
        }
        const executionDataMart = {
          ...dataMart,
          definition: definitionRun,
          schema: snapshot.schema ?? undefined,
        } as DataMart;
        const resolveSourceQuery = await this.resolveSnapshotTableReference({
          dataMartId: dataMart.id,
          projectId: expectedProjectId,
          definition: definitionRun,
          storage: snapshot.sourceStorage,
          liveStorage: toStorageSnapshot(dataMart),
        });
        const targets = await this.loadRelationshipTargets(snapshot, expectedProjectId);
        const targetSourceQueries = new Map<string, Promise<DataQualityQueryResolver>>();
        const compiled: DataQualityCompiledCheck[] = [];

        for (const originalRule of pendingRules) {
          signal?.throwIfAborted();
          const relationshipId =
            originalRule.scope.type === DataQualityScope.RELATIONSHIP
              ? originalRule.scope.relationshipId
              : null;
          const relationshipSnapshot = relationshipId
            ? snapshot.relationships.find(relationship => relationship.id === relationshipId)
            : undefined;
          const rule =
            relationshipSnapshot?.targetAccessible === false
              ? {
                  ...originalRule,
                  isApplicable: false,
                  notApplicableReason: 'Relationship target Data Mart is not accessible',
                }
              : originalRule;
          try {
            compiled.push(
              await this.compiler.compile({
                storageType: dataMart.storage.type,
                resolveSourceQuery,
                schema: snapshot.schema,
                rule,
                relationship: relationshipSnapshot
                  ? this.buildRelationshipContext(
                      dataMartRun,
                      relationshipSnapshot,
                      snapshot.relationshipTargets.find(
                        target => target.relationshipId === relationshipSnapshot.id
                      ),
                      targets.get(relationshipSnapshot.targetDataMartId),
                      targetSourceQueries,
                      expectedProjectId
                    )
                  : undefined,
              })
            );
          } catch (error) {
            const parsed =
              error instanceof DataQualitySourceQueryError ||
              error instanceof DataQualitySnapshotStorageMismatchError
                ? executionError(rule, error)
                : compilationError(rule, error);
            const stored = await this.appendDataQualityResult(
              dataMartRun.id,
              this.createStoredResult(rule.scope, parsed)
            );
            if (!stored) return;
            parsedResults.push(parsed);
          }
        }

        for await (const executed of this.queryExecutor.executeChecks(executionDataMart, compiled, {
          signal,
        })) {
          const rule = pendingRules.find(candidate => candidate.key === executed.check.ruleKey);
          if (!rule) continue;
          let parsed: DataQualityParsedResult;
          try {
            parsed = await this.resultParser.parse(
              dataMart.storage.type,
              executed.check,
              executed.execution
            );
          } catch (error) {
            parsed = parsingError(rule, executed.check, executed.execution, error);
          }
          const stored = await this.appendDataQualityResult(
            dataMartRun.id,
            this.createStoredResult(rule.scope, parsed)
          );
          if (!stored) return;
          parsedResults.push(parsed);
          signal?.throwIfAborted();
        }
      }

      await this.finishRun(dataMartRun, false);
    } catch (error) {
      if (isCancellation(error, signal)) {
        await this.finishRun(dataMartRun, true);
        return;
      }
      if (error instanceof ProjectOperationBlockedException) {
        await this.finishRun(dataMartRun, false, error);
        return;
      }

      const missingRules = pendingRules.filter(
        rule => !parsedResults.some(result => result.ruleKey === rule.key)
      );
      for (const rule of missingRules) {
        const parsed = executionError(rule, error);
        const stored = await this.appendDataQualityResult(
          dataMartRun.id,
          this.createStoredResult(rule.scope, parsed)
        );
        if (!stored) return;
        parsedResults.push(parsed);
      }
      await this.finishRun(dataMartRun, false);
    }

    if (pendingRules.length > 0 && dataMartRun.status === DataMartRunStatus.SUCCESS) {
      await this.publishConsumption(dataMart, dataMartRun.id);
    }
  }

  private async claimRun(
    dataMartRunId: string,
    expectedProjectId: string
  ): Promise<ClaimedDataQualityRun | null> {
    return this.dataSource.transaction(async manager => {
      const runRepository = manager.getRepository(DataMartRun);
      const dataMartRun = await this.findRunWithDataQualityDetails(manager, dataMartRunId, true);
      if (!dataMartRun) throw new Error(`Data Quality run ${dataMartRunId} was not found`);
      if (dataMartRun.dataMart.projectId !== expectedProjectId) {
        throw new Error(`Project mismatch for Data Quality run ${dataMartRunId}`);
      }
      if (!dataMartRun.dataQualitySnapshot || !dataMartRun.dataQualitySummary) {
        throw new Error(`Data Quality snapshot for run ${dataMartRunId} was not found`);
      }
      if (
        dataMartRun.status === DataMartRunStatus.CANCELLED ||
        dataMartRun.status === DataMartRunStatus.SUCCESS ||
        dataMartRun.status === DataMartRunStatus.FAILED ||
        dataMartRun.status === DataMartRunStatus.RESTRICTED
      ) {
        return null;
      }
      if (dataMartRun.status === DataMartRunStatus.PENDING) {
        const startedAt = this.systemClock.now();
        const claim = await runRepository.update(
          { id: dataMartRunId, status: DataMartRunStatus.PENDING },
          { status: DataMartRunStatus.RUNNING, startedAt }
        );
        if (!claim.affected)
          throw new Error(`Data Quality run ${dataMartRunId} could not be claimed`);
        dataMartRun.status = DataMartRunStatus.RUNNING;
        dataMartRun.startedAt = startedAt;
      } else if (dataMartRun.status !== DataMartRunStatus.RUNNING) {
        throw new Error(
          `Data Quality run ${dataMartRunId} has unsupported status ${dataMartRun.status}`
        );
      }
      const startedAt = dataMartRun.startedAt;
      if (!startedAt)
        throw new Error(`Data Quality run ${dataMartRunId} has no persisted start time`);
      dataMartRun.dataQualitySummary = {
        ...dataMartRun.dataQualitySummary,
        state: DataQualitySummaryState.RUNNING,
      };
      const summaryUpdate = await runRepository.update(
        { id: dataMartRunId, status: DataMartRunStatus.RUNNING },
        { dataQualitySummary: dataMartRun.dataQualitySummary }
      );
      if (!summaryUpdate.affected) {
        throw new Error(`Data Quality run ${dataMartRunId} could not persist RUNNING summary`);
      }
      return { dataMartRun, dataMart: dataMartRun.dataMart };
    });
  }

  private async publishConsumption(dataMart: DataMart, dataMartRunId: string): Promise<void> {
    try {
      await this.projectBillingService.registerDataQualityRunConsumption(dataMart, dataMartRunId);
    } catch (error) {
      this.logger.warn(
        `Failed to publish Data Quality consumption for run ${dataMartRunId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async loadRelationshipTargets(
    snapshot: DataQualityRunSnapshot,
    projectId: string
  ): Promise<Map<string, DataMart>> {
    const ids = snapshot.relationshipTargets.map(target => target.targetDataMartId);
    if (ids.length === 0) return new Map();
    const targets = await this.dataMartRepository.find({
      where: { id: In([...new Set(ids)]), projectId },
    });
    return new Map(targets.map(target => [target.id, target]));
  }

  private buildRelationshipContext(
    dataMartRun: DataMartRun,
    snapshot: DataQualityRelationshipSnapshot,
    targetSnapshot: DataQualityRelationshipTargetSnapshot | undefined,
    target: DataMart | undefined,
    targetSourceQueries: Map<string, Promise<DataQualityQueryResolver>>,
    projectId: string
  ): DataQualityRelationshipCompileContext | undefined {
    if (snapshot.targetAccessible === false) {
      return undefined;
    }
    if (!targetSnapshot) {
      throw new Error('Data Quality relationship target snapshot is unavailable');
    }
    return {
      snapshot,
      resolveTargetSourceQuery: async columns => {
        let targetSourceQueryResolver = targetSourceQueries.get(snapshot.id);
        if (!targetSourceQueryResolver) {
          targetSourceQueryResolver = this.resolveRelationshipTargetSourceQuery(
            dataMartRun,
            snapshot,
            targetSnapshot,
            target,
            projectId
          );
          targetSourceQueries.set(snapshot.id, targetSourceQueryResolver);
        }
        return (await targetSourceQueryResolver)(columns);
      },
      targetSchema: targetSnapshot.schema,
      targetStorageType: targetSnapshot.storage.type,
      sourceConnectionId: dataMartRun.dataQualitySnapshot!.sourceStorage.id,
      targetConnectionId: targetSnapshot.storage.id,
    };
  }

  private async resolveRelationshipTargetSourceQuery(
    dataMartRun: DataMartRun,
    relationship: DataQualityRelationshipSnapshot,
    targetSnapshot: DataQualityRelationshipTargetSnapshot,
    target: DataMart | undefined,
    projectId: string
  ): Promise<DataQualityQueryResolver> {
    return this.resolveSnapshotTableReference({
      dataMartId: relationship.targetDataMartId,
      projectId,
      definition: targetSnapshot.definition,
      storage: targetSnapshot.storage,
      liveStorage: toStorageSnapshot(target),
    });
  }

  private async resolveSnapshotTableReference(
    input: DataQualitySnapshotTableReferenceInput
  ): Promise<DataQualityQueryResolver> {
    try {
      const reference = await this.snapshotTableReference.resolve(input);
      return async columns => {
        try {
          return await reference.buildQuery(columns);
        } catch (error) {
          throw new DataQualitySourceQueryError(error);
        }
      };
    } catch (error) {
      if (error instanceof DataQualitySnapshotStorageMismatchError) {
        throw error;
      }
      throw new DataQualitySourceQueryError(error);
    }
  }

  private async appendDataQualityResult(
    dataMartRunId: string,
    result: DataQualityStoredCheckResult
  ): Promise<boolean> {
    return this.dataSource.transaction(async manager => {
      const current = await this.findRunForResultMutation(manager, dataMartRunId, true);
      if (!current) throw new Error(`Data Quality run ${dataMartRunId} was not found`);
      if (
        current.status !== DataMartRunStatus.RUNNING &&
        current.status !== DataMartRunStatus.CANCELLED
      ) {
        return false;
      }
      const results = current.dataQualityResults ?? [];
      const index = results.findIndex(item => item.ruleKey === result.ruleKey);
      current.dataQualityResults =
        index === -1
          ? [...results, result]
          : results.map((item, itemIndex) => (itemIndex === index ? result : item));
      await manager.getRepository(DataMartRun).save(current);
      return true;
    });
  }

  private createStoredResult(
    scope: DataQualityStoredCheckResult['scope'],
    parsed: DataQualityParsedResult
  ): DataQualityStoredCheckResult {
    return {
      id: randomUUID(),
      createdAt: this.systemClock.now().toISOString(),
      ruleKey: parsed.ruleKey,
      category: parsed.category,
      scope,
      severity: parsed.severity,
      status: parsed.status,
      violationCount: parsed.violationCount,
      description: parsed.description,
      examples: parsed.examples,
      sql: parsed.sql,
      error: parsed.error,
    };
  }

  private async finishRun(
    dataMartRun: DataMartRun,
    cancelled: boolean,
    restriction?: ProjectOperationBlockedException
  ): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const runRepository = manager.getRepository(DataMartRun);
      const currentRun = await this.findRunForResultMutation(manager, dataMartRun.id, true);
      if (!currentRun?.dataQualitySummary) {
        throw new Error(`Data Quality run ${dataMartRun.id} was not found`);
      }
      if (
        currentRun.status === DataMartRunStatus.FAILED ||
        currentRun.status === DataMartRunStatus.SUCCESS ||
        currentRun.status === DataMartRunStatus.RESTRICTED ||
        (currentRun.status === DataMartRunStatus.CANCELLED && (cancelled || restriction))
      ) {
        Object.assign(dataMartRun, currentRun);
        return;
      }
      if (
        currentRun.status !== DataMartRunStatus.RUNNING &&
        currentRun.status !== DataMartRunStatus.CANCELLED
      ) {
        throw new Error(
          `Data Quality run ${dataMartRun.id} cannot finish from ${currentRun.status}`
        );
      }
      const results = (currentRun.dataQualityResults ?? []).map(toParsedResult);
      const summary = aggregateDataQualitySummary(
        results,
        currentRun.dataQualitySummary.enabledChecks
      );
      if (cancelled) summary.state = DataQualitySummaryState.CANCELLED;
      else if (restriction) summary.state = DataQualitySummaryState.RESTRICTED;
      const finishedAt =
        currentRun.status === DataMartRunStatus.CANCELLED && !cancelled
          ? this.systemClock.now()
          : (currentRun.finishedAt ?? this.systemClock.now());
      currentRun.dataQualitySummary = summary;
      currentRun.status = cancelled
        ? DataMartRunStatus.CANCELLED
        : restriction
          ? DataMartRunStatus.RESTRICTED
          : summary.state === DataQualitySummaryState.EXECUTION_FAILED
            ? DataMartRunStatus.FAILED
            : DataMartRunStatus.SUCCESS;
      currentRun.finishedAt = finishedAt;
      currentRun.errors = restriction
        ? [restriction.message]
        : results.some(result => result.status === DataQualityCheckStatus.ERROR)
          ? [DATA_QUALITY_RUN_EXECUTION_ERROR_MESSAGE]
          : [];
      await runRepository.save(currentRun);
      Object.assign(dataMartRun, currentRun);
    });
  }

  private async findRunWithDataQualityDetails(
    manager: EntityManager,
    runId: string,
    lock = false
  ): Promise<DataMartRun | null> {
    const query = manager
      .getRepository(DataMartRun)
      .createQueryBuilder('run')
      .addSelect('run.dataQualitySnapshot')
      .addSelect('run.dataQualityResults')
      .innerJoinAndSelect('run.dataMart', 'dataMart')
      .innerJoinAndSelect('dataMart.storage', 'storage')
      .where('run.id = :runId', { runId })
      .andWhere('run.type = :type', { type: DataMartRunType.DATA_QUALITY });
    const canLock = ['mysql', 'mariadb'].includes(String(this.dataSource.options?.type));
    if (lock && canLock) query.setLock('pessimistic_write');
    return query.getOne();
  }

  private async findRunForResultMutation(
    manager: EntityManager,
    runId: string,
    lock = false
  ): Promise<DataMartRun | null> {
    const query = manager
      .getRepository(DataMartRun)
      .createQueryBuilder('run')
      .select(['run.id', 'run.status', 'run.dataQualitySummary', 'run.finishedAt'])
      .addSelect('run.dataQualityResults')
      .where('run.id = :runId', { runId })
      .andWhere('run.type = :type', { type: DataMartRunType.DATA_QUALITY });
    const canLock = ['mysql', 'mariadb'].includes(String(this.dataSource.options?.type));
    if (lock && canLock) query.setLock('pessimistic_write');
    return query.getOne();
  }
}

function toParsedResult(result: DataQualityStoredCheckResult): DataQualityParsedResult {
  return {
    category: result.category,
    ruleKey: result.ruleKey,
    severity: result.severity,
    status: result.status,
    violationCount: result.violationCount,
    description: result.description,
    examples: result.examples,
    sql: result.sql,
    error: result.error,
  };
}

function compilationError(
  rule: DataQualityRunSnapshot['config']['rules'][number],
  error: unknown
): DataQualityParsedResult {
  return failedResult(rule, 'DATA_QUALITY_COMPILATION_ERROR', error);
}

function executionError(
  rule: DataQualityRunSnapshot['config']['rules'][number],
  error: unknown
): DataQualityParsedResult {
  return failedResult(rule, 'DATA_QUALITY_EXECUTION_ERROR', error);
}

function parsingError(
  rule: DataQualityRunSnapshot['config']['rules'][number],
  check: DataQualityCompiledCheck,
  execution: DataQualityQueryExecution | null,
  error: unknown
): DataQualityParsedResult {
  return {
    ...executionError(rule, error),
    sql: execution?.sql ?? check.sql,
  };
}

function failedResult(
  rule: DataQualityRunSnapshot['config']['rules'][number],
  code: string,
  error: unknown
): DataQualityParsedResult {
  const message = error instanceof Error ? error.message : String(error);
  const providerIdentity = getProviderErrorIdentity(error);
  const providerCode =
    providerIdentity.code ?? providerIdentity.errorCode ?? providerIdentity.reason;
  const details = providerCode
    ? {
        dataQualityCode: code,
        ...(providerIdentity.code ? { providerCode: providerIdentity.code } : {}),
        ...(providerIdentity.errorCode ? { providerErrorCode: providerIdentity.errorCode } : {}),
        ...(providerIdentity.reason ? { providerReason: providerIdentity.reason } : {}),
      }
    : null;
  const mapped: DataQualityMappedError = { code: providerCode ?? code, message, details };
  return {
    category: rule.category,
    ruleKey: rule.key,
    severity: rule.severity,
    status: DataQualityCheckStatus.ERROR,
    violationCount: 0,
    description: message,
    examples: [],
    sql: null,
    error: mapped,
  };
}

function getProviderErrorIdentity(error: unknown): {
  code: string | null;
  errorCode: string | null;
  reason: string | null;
} {
  if (typeof error !== 'object' || error === null) {
    return { code: null, errorCode: null, reason: null };
  }
  const identity = error as ProviderErrorIdentity;
  return {
    code: safeProviderIdentityValue(identity.code),
    errorCode: safeProviderIdentityValue(identity.errorCode),
    reason: safeProviderIdentityValue(identity.reason),
  };
}

function safeProviderIdentityValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_.:-]{1,255}$/.test(trimmed) ? trimmed : null;
}

function toStorageSnapshot(
  dataMart: DataMart | undefined
): DataQualityRunSnapshot['sourceStorage'] | null {
  return dataMart?.storage
    ? {
        id: dataMart.storage.id,
        type: dataMart.storage.type,
      }
    : null;
}

function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}
