import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import {
  TriggerExecutionOwnership,
  TriggerExecutionOwnershipError,
} from '../../common/scheduler/shared/trigger-execution-ownership.error';
import {
  DataQualityCheckCompiler,
  DataQualityCompiledCheck,
  DataQualityQueryPurpose,
  DataQualityRelationshipCompileContext,
} from '../data-quality/data-quality-check-compiler';
import { DataQualityQueryExecutorService } from '../data-quality/data-quality-query-executor.service';
import {
  DataQualityParsedResult,
  DataQualityQueryExecution,
  DataQualityResultParser,
  aggregateDataQualitySummary,
} from '../data-quality/data-quality-result-parser';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { IdentifierEscaperFacade } from '../data-storage-types/facades/identifier-escaper.facade';
import { QueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import {
  ProviderErrorIdentity,
  wrapProviderError,
} from '../data-storage-types/utils/provider-error.utils';
import {
  DataQualityMappedError,
  DataQualityRelationshipSnapshot,
  DataQualityRunSnapshot,
  DataQualityStoredCheckResult,
} from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { isSqlDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import {
  DataQualityConsumptionPublicationError,
  DataQualityConsumptionService,
} from '../services/data-quality-consumption.service';
import { DataMartTableReferenceService } from '../services/data-mart-table-reference.service';

interface ClaimedDataQualityRun {
  dataMartRun: DataMartRun;
  dataMart: DataMart;
}

export class DataQualityResultPersistenceError extends Error {
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'DataQualityResultPersistenceError';
  }
}

const DATA_QUALITY_TECHNICAL_VIEW_ERROR_MESSAGE = 'Failed to refresh Data Quality technical view';

export class DataQualityTechnicalViewRefreshError extends Error implements ProviderErrorIdentity {
  code?: unknown;
  errorCode?: unknown;
  reason?: unknown;

  constructor(cause: unknown) {
    const wrapped = wrapProviderError(DATA_QUALITY_TECHNICAL_VIEW_ERROR_MESSAGE, cause);
    super(wrapped.message, { cause });
    this.name = 'DataQualityTechnicalViewRefreshError';
    this.code = wrapped.code;
    this.errorCode = wrapped.errorCode;
    this.reason = wrapped.reason;
  }
}

@Injectable()
export class RunDataQualityService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    private readonly queryBuilder: DataMartQueryBuilderFacade,
    private readonly tableReferenceService: DataMartTableReferenceService,
    private readonly identifierEscaper: IdentifierEscaperFacade,
    private readonly compiler: DataQualityCheckCompiler,
    private readonly queryExecutor: DataQualityQueryExecutorService,
    private readonly resultParser: DataQualityResultParser,
    private readonly dataQualityConsumptionService: DataQualityConsumptionService,
    private readonly systemClock: SystemTimeService
  ) {}

  async executeExistingRun(
    dataMartRunId: string,
    expectedProjectId: string,
    signal?: AbortSignal,
    ownership?: TriggerExecutionOwnership
  ): Promise<void> {
    await ownership?.assertOwned();
    signal?.throwIfAborted();
    const claimed = await this.claimRun(dataMartRunId, expectedProjectId, ownership);
    if (!claimed) return;
    await ownership?.assertOwned();
    const { dataMartRun, dataMart } = claimed;
    const snapshot = dataMartRun.dataQualitySnapshot!;
    const enabledRules = snapshot.config.rules.filter(rule => rule.enabled);
    const persisted = dataMartRun.dataQualityResults ?? [];
    const persistedKeys = new Set(persisted.map(result => result.ruleKey));
    const parsedResults: DataQualityParsedResult[] = persisted.map(toParsedResult);
    const pendingRules = enabledRules.filter(rule => !persistedKeys.has(rule.key));

    try {
      await this.publishConsumptionIfNeeded(dataMartRun, ownership);
    } catch (error) {
      if (error instanceof TriggerExecutionOwnershipError) throw error;
      // Publication is deliberately outside the execution error path: a configured
      // delivery failure must leave the durable RUNNING run resumable before any SQL.
      throw error instanceof DataQualityConsumptionPublicationError
        ? error
        : new DataQualityConsumptionPublicationError(error);
    }

    try {
      signal?.throwIfAborted();
      if (pendingRules.length > 0) {
        await ownership?.assertOwned();
        const executionDataMart = {
          ...dataMart,
          definition: dataMartRun.definitionRun,
          schema: snapshot.schema ?? undefined,
        } as DataMart;
        const sourceQuery = await this.buildSourceQuery(dataMart, dataMartRun.definitionRun);
        const targets = await this.loadRelationshipTargets(snapshot, expectedProjectId);
        const targetSourceQueries = new Map<string, Promise<string | QueryBuildResult>>();
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
                sourceQuery,
                schema: snapshot.schema,
                timezone: snapshot.timezone,
                rule,
                relationship: relationshipSnapshot
                  ? this.buildRelationshipContext(
                      dataMart,
                      relationshipSnapshot,
                      targets.get(relationshipSnapshot.targetDataMartId),
                      targetSourceQueries
                    )
                  : undefined,
              })
            );
          } catch (error) {
            const parsed =
              error instanceof DataQualityTechnicalViewRefreshError
                ? executionError(rule, error)
                : compilationError(rule, error);
            await ownership?.assertOwned();
            const stored = await this.appendDataQualityResult(
              dataMartRun.id,
              this.createStoredResult(rule.scope, parsed),
              ownership
            );
            if (!stored) return;
            parsedResults.push(parsed);
          }
        }

        for await (const executed of this.queryExecutor.executeChecks(executionDataMart, compiled, {
          signal,
          beforeExecuteQuery: async () => ownership?.assertOwned(),
          shouldExecuteQuery: async (check, query, executions) => {
            if (query.purpose !== DataQualityQueryPurpose.EXAMPLES) return true;
            try {
              const preliminary = await this.resultParser.parse(
                dataMart.storage.type,
                check,
                executions
              );
              return preliminary.status === DataQualityCheckStatus.FAILED;
            } catch {
              // The final parse below records the parser failure for this rule. Examples cannot
              // make an unparseable measurement more useful, so avoid another warehouse query.
              return false;
            }
          },
        })) {
          await ownership?.assertOwned();
          const rule = pendingRules.find(candidate => candidate.key === executed.check.ruleKey);
          if (!rule) continue;
          let parsed: DataQualityParsedResult;
          try {
            parsed = await this.resultParser.parse(
              dataMart.storage.type,
              executed.check,
              executed.executions
            );
          } catch (error) {
            parsed = parsingError(rule, executed.check, executed.executions, error);
          }
          await ownership?.assertOwned();
          const stored = await this.appendDataQualityResult(
            dataMartRun.id,
            this.createStoredResult(rule.scope, parsed),
            ownership
          );
          if (!stored) return;
          parsedResults.push(parsed);
          signal?.throwIfAborted();
        }
      }

      await ownership?.assertOwned();
      await this.finishRun(dataMartRun, false, ownership);
    } catch (error) {
      if (error instanceof TriggerExecutionOwnershipError) throw error;
      if (error instanceof DataQualityResultPersistenceError) throw error;
      if (isCancellation(error, signal)) {
        await this.finishRun(dataMartRun, true, ownership);
        return;
      }

      const missingRules = pendingRules.filter(
        rule => !parsedResults.some(result => result.ruleKey === rule.key)
      );
      for (const rule of missingRules) {
        const parsed = executionError(rule, error);
        await ownership?.assertOwned();
        const stored = await this.appendDataQualityResult(
          dataMartRun.id,
          this.createStoredResult(rule.scope, parsed),
          ownership
        );
        if (!stored) return;
        parsedResults.push(parsed);
      }
      await ownership?.assertOwned();
      await this.finishRun(dataMartRun, false, ownership);
    }
  }

  private async claimRun(
    dataMartRunId: string,
    expectedProjectId: string,
    ownership?: TriggerExecutionOwnership
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
        dataMartRun.status === DataMartRunStatus.FAILED
      ) {
        return null;
      }
      await ownership?.assertOwned(manager);
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
      // RUNNING remains resumable after a retryable failure. The caller's persisted trigger epoch
      // serializes execution and is revalidated at every external/persistence boundary.

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

  private async publishConsumptionIfNeeded(
    dataMartRun: DataMartRun,
    ownership?: TriggerExecutionOwnership
  ): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const current = await this.findRunWithDataQualityDetails(manager, dataMartRun.id, true);
      if (!current) throw new Error(`Data Quality run ${dataMartRun.id} was not found`);
      await this.dataQualityConsumptionService.settle(manager, current, ownership);
      dataMartRun.dataQualityConsumptionPublishedAt =
        current.dataQualityConsumptionPublishedAt ?? null;
    });
  }

  private async loadRelationshipTargets(
    snapshot: DataQualityRunSnapshot,
    projectId: string
  ): Promise<Map<string, DataMart>> {
    const ids = snapshot.relationships
      .filter(relationship => relationship.targetAccessible !== false)
      .map(relationship => relationship.targetDataMartId);
    if (ids.length === 0) return new Map();
    const targets = await this.dataMartRepository.find({
      where: { id: In([...new Set(ids)]), projectId },
    });
    return new Map(targets.map(target => [target.id, target]));
  }

  private buildRelationshipContext(
    source: DataMart,
    snapshot: DataQualityRelationshipSnapshot,
    target: DataMart | undefined,
    targetSourceQueries: Map<string, Promise<string | QueryBuildResult>>
  ): DataQualityRelationshipCompileContext | undefined {
    if (
      snapshot.targetAccessible === false ||
      !target?.definition ||
      !target.schema ||
      !target.storage
    ) {
      return undefined;
    }
    return {
      snapshot,
      resolveTargetSourceQuery: () => {
        let targetSourceQuery = targetSourceQueries.get(target.id);
        if (!targetSourceQuery) {
          targetSourceQuery = this.buildSourceQuery(target, target.definition!);
          targetSourceQueries.set(target.id, targetSourceQuery);
        }
        return targetSourceQuery;
      },
      targetSchema: target.schema,
      targetStorageType: target.storage.type,
      sourceConnectionId: source.storage.id,
      targetConnectionId: target.storage.id,
    };
  }

  private async buildSourceQuery(
    dataMart: DataMart,
    definition: DataMartDefinition
  ): Promise<string | QueryBuildResult> {
    if (!isSqlDefinition(definition)) {
      return this.queryBuilder.buildQuery(dataMart.storage.type, definition);
    }
    try {
      const reference = await this.tableReferenceService.resolveTableName(
        dataMart.id,
        dataMart.projectId
      );
      const escapedReference = await this.identifierEscaper.escapeIdentifier(
        dataMart.storage.type,
        reference
      );
      return `SELECT * FROM ${escapedReference}`;
    } catch (error) {
      throw new DataQualityTechnicalViewRefreshError(error);
    }
  }

  private async appendDataQualityResult(
    dataMartRunId: string,
    result: DataQualityStoredCheckResult,
    ownership?: TriggerExecutionOwnership
  ): Promise<boolean> {
    try {
      return await this.dataSource.transaction(async manager => {
        const current = await this.findRunWithDataQualityDetails(manager, dataMartRunId, true);
        if (!current) throw new Error(`Data Quality run ${dataMartRunId} was not found`);
        if (current.status !== DataMartRunStatus.RUNNING) return false;
        await ownership?.assertOwned(manager);
        const results = current.dataQualityResults ?? [];
        const index = results.findIndex(item => item.ruleKey === result.ruleKey);
        current.dataQualityResults =
          index === -1
            ? [...results, result]
            : results.map((item, itemIndex) => (itemIndex === index ? result : item));
        await manager.getRepository(DataMartRun).save(current);
        return true;
      });
    } catch (error) {
      if (error instanceof TriggerExecutionOwnershipError) throw error;
      throw new DataQualityResultPersistenceError(error);
    }
  }

  private createStoredResult(
    scope: DataQualityStoredCheckResult['scope'],
    parsed: DataQualityParsedResult
  ): DataQualityStoredCheckResult {
    return {
      id: uuidv7(),
      createdAt: this.systemClock.now().toISOString(),
      ruleKey: parsed.ruleKey,
      category: parsed.category,
      scope,
      severity: parsed.severity,
      status: parsed.status,
      violationCount: parsed.violationCount,
      description: parsed.description,
      examples: parsed.examples,
      executedSql: parsed.executedSql,
      reproductionSql: parsed.reproductionSql,
      error: parsed.error,
    };
  }

  private async finishRun(
    dataMartRun: DataMartRun,
    cancelled: boolean,
    ownership?: TriggerExecutionOwnership
  ): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const runRepository = manager.getRepository(DataMartRun);
      const currentRun = await this.findRunWithDataQualityDetails(manager, dataMartRun.id, true);
      if (!currentRun?.dataQualitySummary) {
        throw new Error(`Data Quality run ${dataMartRun.id} was not found`);
      }
      if (
        [DataMartRunStatus.CANCELLED, DataMartRunStatus.FAILED, DataMartRunStatus.SUCCESS].includes(
          currentRun.status
        )
      ) {
        Object.assign(dataMartRun, currentRun);
        return;
      }
      if (currentRun.status !== DataMartRunStatus.RUNNING) {
        throw new Error(
          `Data Quality run ${dataMartRun.id} cannot finish from ${currentRun.status}`
        );
      }
      await ownership?.assertOwned(manager);
      const results = (currentRun.dataQualityResults ?? []).map(toParsedResult);
      const summary = aggregateDataQualitySummary(
        results,
        currentRun.dataQualitySummary.enabledChecks
      );
      const wasCancelled = cancelled;
      if (wasCancelled) summary.state = DataQualitySummaryState.CANCELLED;
      const finishedAt = currentRun.finishedAt ?? this.systemClock.now();
      currentRun.dataQualitySummary = summary;
      currentRun.status = wasCancelled
        ? DataMartRunStatus.CANCELLED
        : summary.state === DataQualitySummaryState.EXECUTION_FAILED
          ? DataMartRunStatus.FAILED
          : DataMartRunStatus.SUCCESS;
      currentRun.finishedAt = finishedAt;
      currentRun.errors = results
        .filter(result => result.status === DataQualityCheckStatus.ERROR)
        .map(result => result.error?.message ?? result.description);
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
      .addSelect('run.dataQualityConsumptionPublishedAt')
      .innerJoinAndSelect('run.dataMart', 'dataMart')
      .innerJoinAndSelect('dataMart.storage', 'storage')
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
    executedSql: result.executedSql,
    reproductionSql: result.reproductionSql,
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
  executions: readonly DataQualityQueryExecution[],
  error: unknown
): DataQualityParsedResult {
  return {
    ...executionError(rule, error),
    executedSql: executions.map(execution => execution.sql),
    reproductionSql: check.reproductionSql,
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
    executedSql: [],
    reproductionSql: null,
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

function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}
