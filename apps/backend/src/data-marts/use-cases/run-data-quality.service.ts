import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
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
import { DataQualityMappedError } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityCheckResult } from '../entities/data-quality-check-result.entity';
import { DataQualityRun } from '../entities/data-quality-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { ConsumptionTrackingService } from '../services/consumption-tracking.service';
import { createDataQualityLifecycleSummary } from '../services/data-quality-run.service';

interface ClaimedDataQualityRun {
  dataMartRun: DataMartRun;
  qualityRun: DataQualityRun;
  dataMart: DataMart;
}

export class DataQualityConsumptionPublicationError extends Error {
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'DataQualityConsumptionPublicationError';
  }
}

@Injectable()
export class RunDataQualityService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    @InjectRepository(DataQualityRun)
    private readonly dataQualityRunRepository: Repository<DataQualityRun>,
    @InjectRepository(DataQualityCheckResult)
    private readonly resultRepository: Repository<DataQualityCheckResult>,
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    private readonly queryBuilder: DataMartQueryBuilderFacade,
    private readonly compiler: DataQualityCheckCompiler,
    private readonly queryExecutor: DataQualityQueryExecutorService,
    private readonly resultParser: DataQualityResultParser,
    private readonly consumptionTrackingService: ConsumptionTrackingService,
    private readonly systemClock: SystemTimeService
  ) {}

  async executeExistingRun(
    dataMartRunId: string,
    expectedProjectId: string,
    signal?: AbortSignal
  ): Promise<void> {
    signal?.throwIfAborted();
    const claimed = await this.claimRun(dataMartRunId, expectedProjectId);
    if (!claimed) return;
    const { dataMartRun, qualityRun, dataMart } = claimed;
    const enabledRules = qualityRun.configSnapshot.rules.filter(rule => rule.enabled);
    const persisted = await this.resultRepository.find({
      where: { dataQualityRunId: qualityRun.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const persistedKeys = new Set(persisted.map(result => result.ruleKey));
    const parsedResults: DataQualityParsedResult[] = persisted.map(toParsedResult);
    const pendingRules = enabledRules.filter(rule => !persistedKeys.has(rule.key));

    try {
      signal?.throwIfAborted();
      await this.publishConsumptionIfNeeded(dataMart, dataMartRun, qualityRun);
      signal?.throwIfAborted();
    } catch (error) {
      if (isCancellation(error, signal)) {
        await this.finishRun(dataMartRun, qualityRun, parsedResults, true);
        return;
      }
      // Publication is deliberately outside the execution error path: a configured
      // delivery failure must leave the durable RUNNING run resumable before any SQL.
      throw new DataQualityConsumptionPublicationError(error);
    }

    try {
      if (pendingRules.length > 0) {
        const executionDataMart = {
          ...dataMart,
          definition: dataMartRun.definitionRun,
          schema: qualityRun.schemaSnapshot ?? undefined,
        } as DataMart;
        const sourceQuery = await this.queryBuilder.buildQuery(
          dataMart.storage.type,
          dataMartRun.definitionRun
        );
        const targets = await this.loadRelationshipTargets(qualityRun, expectedProjectId);
        const compiled: DataQualityCompiledCheck[] = [];

        for (const originalRule of pendingRules) {
          signal?.throwIfAborted();
          const relationshipId =
            originalRule.scope.type === DataQualityScope.RELATIONSHIP
              ? originalRule.scope.relationshipId
              : null;
          const relationshipSnapshot = relationshipId
            ? qualityRun.relationshipSnapshots.find(snapshot => snapshot.id === relationshipId)
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
                schema: qualityRun.schemaSnapshot,
                timezone: qualityRun.timezone,
                rule,
                definitionType: qualityRun.definitionTypeSnapshot,
                definition: dataMartRun.definitionRun,
                relationship: relationshipSnapshot
                  ? await this.buildRelationshipContext(
                      dataMart,
                      relationshipSnapshot,
                      targets.get(relationshipSnapshot.targetDataMartId)
                    )
                  : undefined,
              })
            );
          } catch (error) {
            const parsed = compilationError(rule, error);
            await this.persistResult(qualityRun.id, rule.scope, parsed);
            parsedResults.push(parsed);
          }
        }

        for await (const executed of this.queryExecutor.executeChecks(executionDataMart, compiled, {
          signal,
          shouldExecuteQuery: async (check, query, executions) => {
            if (query.purpose !== DataQualityQueryPurpose.EXAMPLES) return true;
            try {
              const preliminary = await this.resultParser.parse(
                dataMart.storage.type,
                check,
                executions,
                { now: this.systemClock.now() }
              );
              return preliminary.status === DataQualityCheckStatus.FAILED;
            } catch {
              // The final parse below records the parser failure for this rule. Examples cannot
              // make an unparseable measurement more useful, so avoid another warehouse query.
              return false;
            }
          },
        })) {
          const rule = pendingRules.find(candidate => candidate.key === executed.check.ruleKey);
          if (!rule) continue;
          let parsed: DataQualityParsedResult;
          try {
            parsed = await this.resultParser.parse(
              dataMart.storage.type,
              executed.check,
              executed.executions,
              { now: this.systemClock.now() }
            );
          } catch (error) {
            parsed = parsingError(rule, executed.check, executed.executions, error);
          }
          await this.persistResult(qualityRun.id, rule.scope, parsed);
          parsedResults.push(parsed);
          signal?.throwIfAborted();
        }
      }

      await this.finishRun(dataMartRun, qualityRun, parsedResults, false);
    } catch (error) {
      if (isCancellation(error, signal)) {
        await this.finishRun(dataMartRun, qualityRun, parsedResults, true);
        return;
      }

      const missingRules = pendingRules.filter(
        rule => !parsedResults.some(result => result.ruleKey === rule.key)
      );
      for (const rule of missingRules) {
        const parsed = executionError(rule, error);
        await this.persistResult(qualityRun.id, rule.scope, parsed);
        parsedResults.push(parsed);
      }
      await this.finishRun(dataMartRun, qualityRun, parsedResults, false);
    }
  }

  private async claimRun(
    dataMartRunId: string,
    expectedProjectId: string
  ): Promise<ClaimedDataQualityRun | null> {
    return this.dataSource.transaction(async manager => {
      const runRepository = manager.getRepository(DataMartRun);
      const qualityRepository = manager.getRepository(DataQualityRun);
      const dataMartRun = await runRepository.findOne({
        where: { id: dataMartRunId, type: DataMartRunType.DATA_QUALITY },
        relations: { dataMart: true },
      });
      if (!dataMartRun) throw new Error(`Data Quality run ${dataMartRunId} was not found`);
      if (dataMartRun.dataMart.projectId !== expectedProjectId) {
        throw new Error(`Project mismatch for Data Quality run ${dataMartRunId}`);
      }
      const qualityRun = await qualityRepository.findOne({ where: { dataMartRunId } });
      if (!qualityRun)
        throw new Error(`Data Quality snapshot for run ${dataMartRunId} was not found`);
      if (
        dataMartRun.status === DataMartRunStatus.CANCELLED ||
        dataMartRun.status === DataMartRunStatus.SUCCESS ||
        dataMartRun.status === DataMartRunStatus.FAILED
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
        qualityRun.startedAt = startedAt;
      } else if (dataMartRun.status !== DataMartRunStatus.RUNNING) {
        throw new Error(
          `Data Quality run ${dataMartRunId} has unsupported status ${dataMartRun.status}`
        );
      }

      const startedAt = dataMartRun.startedAt ?? qualityRun.startedAt;
      if (!startedAt)
        throw new Error(`Data Quality run ${dataMartRunId} has no persisted start time`);
      dataMartRun.startedAt = startedAt;
      qualityRun.startedAt = startedAt;
      qualityRun.summary = {
        ...createDataQualityLifecycleSummary(
          DataQualitySummaryState.RUNNING,
          qualityRun.summary.enabledChecks
        ),
        totalChecks: qualityRun.summary.totalChecks,
        passedChecks: qualityRun.summary.passedChecks,
        failedChecks: qualityRun.summary.failedChecks,
        notApplicableChecks: qualityRun.summary.notApplicableChecks,
        errorChecks: qualityRun.summary.errorChecks,
        noticeFindings: qualityRun.summary.noticeFindings,
        warningFindings: qualityRun.summary.warningFindings,
        errorFindings: qualityRun.summary.errorFindings,
        violationCount: qualityRun.summary.violationCount,
        highestSeverity: qualityRun.summary.highestSeverity,
      };
      await qualityRepository.save(qualityRun);
      return { dataMartRun, qualityRun, dataMart: dataMartRun.dataMart };
    });
  }

  private async publishConsumptionIfNeeded(
    dataMart: DataMart,
    dataMartRun: DataMartRun,
    qualityRun: DataQualityRun
  ): Promise<void> {
    if (qualityRun.consumptionPublishedAt) return;
    const startedAt = qualityRun.startedAt ?? dataMartRun.startedAt;
    if (!startedAt)
      throw new Error('Cannot publish Data Quality consumption before durable RUNNING');
    const status = await this.consumptionTrackingService.registerDataQualityRunConsumption(
      dataMart,
      dataMartRun.id,
      startedAt
    );
    if (status === 'DISABLED') return;
    const publishedAt = this.systemClock.now();
    const marker = await this.dataQualityRunRepository.update(
      { id: qualityRun.id, consumptionPublishedAt: IsNull() },
      { consumptionPublishedAt: publishedAt }
    );
    if (marker.affected) {
      qualityRun.consumptionPublishedAt = publishedAt;
      return;
    }
    const reloaded = await this.dataQualityRunRepository.findOne({
      where: { id: qualityRun.id },
    });
    if (!reloaded?.consumptionPublishedAt) {
      throw new Error(
        `Failed to persist consumption marker for Data Quality run ${dataMartRun.id}`
      );
    }
    qualityRun.consumptionPublishedAt = reloaded.consumptionPublishedAt;
  }

  private async loadRelationshipTargets(
    qualityRun: DataQualityRun,
    projectId: string
  ): Promise<Map<string, DataMart>> {
    const ids = qualityRun.relationshipSnapshots
      .filter(snapshot => snapshot.targetAccessible !== false)
      .map(snapshot => snapshot.targetDataMartId);
    if (ids.length === 0) return new Map();
    const targets = await this.dataMartRepository.find({
      where: { id: In([...new Set(ids)]), projectId },
    });
    return new Map(targets.map(target => [target.id, target]));
  }

  private async buildRelationshipContext(
    source: DataMart,
    snapshot: DataQualityRun['relationshipSnapshots'][number],
    target: DataMart | undefined
  ): Promise<DataQualityRelationshipCompileContext | undefined> {
    if (
      snapshot.targetAccessible === false ||
      !target?.definition ||
      !target.schema ||
      !target.storage
    ) {
      return undefined;
    }
    const targetSourceQuery = await this.queryBuilder.buildQuery(
      target.storage.type,
      target.definition
    );
    return {
      snapshot,
      targetSourceQuery,
      targetSchema: target.schema,
      targetStorageType: target.storage.type,
      sourceConnectionId: source.storage.id,
      targetConnectionId: target.storage.id,
    };
  }

  private async persistResult(
    dataQualityRunId: string,
    scope: DataQualityCheckResult['scope'],
    parsed: DataQualityParsedResult
  ): Promise<void> {
    await this.resultRepository.save(
      this.resultRepository.create({
        dataQualityRunId,
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
        errorCode: parsed.error?.code ?? null,
        errorMessage: parsed.error?.message ?? null,
        errorDetails: parsed.error?.details ?? null,
      })
    );
  }

  private async finishRun(
    dataMartRun: DataMartRun,
    qualityRun: DataQualityRun,
    results: DataQualityParsedResult[],
    cancelled: boolean
  ): Promise<void> {
    const summary = aggregateDataQualitySummary(results, qualityRun.summary.enabledChecks);
    await this.dataSource.transaction(async manager => {
      const runRepository = manager.getRepository(DataMartRun);
      const canLock = ['mysql', 'mariadb'].includes(String(this.dataSource.options?.type));
      const currentRun = await runRepository.findOne({
        where: { id: dataMartRun.id },
        ...(canLock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });
      const wasCancelled =
        cancelled ||
        dataMartRun.status === DataMartRunStatus.CANCELLED ||
        currentRun?.status === DataMartRunStatus.CANCELLED;
      if (wasCancelled) summary.state = DataQualitySummaryState.CANCELLED;
      const finishedAt = currentRun?.finishedAt ?? this.systemClock.now();
      qualityRun.summary = summary;
      qualityRun.finishedAt = finishedAt;
      dataMartRun.status = wasCancelled
        ? DataMartRunStatus.CANCELLED
        : summary.state === DataQualitySummaryState.EXECUTION_FAILED
          ? DataMartRunStatus.FAILED
          : DataMartRunStatus.SUCCESS;
      dataMartRun.finishedAt = finishedAt;
      dataMartRun.errors = results
        .filter(result => result.status === DataQualityCheckStatus.ERROR)
        .map(result => result.error?.message ?? result.description);
      await manager.getRepository(DataQualityRun).save(qualityRun);
      await runRepository.save(dataMartRun);
    });
  }
}

function toParsedResult(result: DataQualityCheckResult): DataQualityParsedResult {
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
    error: result.errorMessage
      ? { code: result.errorCode, message: result.errorMessage, details: result.errorDetails }
      : null,
  };
}

function compilationError(
  rule: DataQualityRun['configSnapshot']['rules'][number],
  error: unknown
): DataQualityParsedResult {
  return failedResult(rule, 'DATA_QUALITY_COMPILATION_ERROR', error);
}

function executionError(
  rule: DataQualityRun['configSnapshot']['rules'][number],
  error: unknown
): DataQualityParsedResult {
  return failedResult(rule, 'DATA_QUALITY_EXECUTION_ERROR', error);
}

function parsingError(
  rule: DataQualityRun['configSnapshot']['rules'][number],
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
  rule: DataQualityRun['configSnapshot']['rules'][number],
  code: string,
  error: unknown
): DataQualityParsedResult {
  const message = error instanceof Error ? error.message : String(error);
  const mapped: DataQualityMappedError = { code, message, details: null };
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

function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}
