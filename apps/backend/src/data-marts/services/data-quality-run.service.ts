import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { RunType } from '../../common/scheduler/shared/types';
import { TriggerExecutionOwnership } from '../../common/scheduler/shared/trigger-execution-ownership.error';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import {
  DataQualityConfig,
  DataQualityConfigSchema,
  EffectiveDataQualityConfig,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import {
  DataQualityRelationshipSnapshot,
  DataQualitySummary,
} from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { resolveEffectiveDataQualityConfig } from './data-quality-config-resolver';
import { DataQualityRunTriggerService } from './data-quality-run-trigger.service';
import { DataQualityConsumptionService } from './data-quality-consumption.service';
import { aggregateDataQualitySummary } from '../data-quality/data-quality-result-parser';

export interface EnqueueDataQualityRunCommand {
  dataMartId: string;
  projectId: string;
  createdById: string;
  runType: RunType;
  relationshipTargetAccess: ReadonlyMap<string, boolean>;
  /** Presence means Save & Run. `null` resets the saved config to the system preset. */
  config?: DataQualityConfig | null;
}

export interface EnqueuedDataQualityRun {
  dataMartRunId: string;
}

export interface DataQualityConfigState {
  savedConfig: DataQualityConfig | null;
  effectiveConfig: EffectiveDataQualityConfig;
  relationshipSnapshots: DataQualityRelationshipSnapshot[];
}

@Injectable()
export class DataQualityRunService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    @InjectRepository(DataMartRelationship)
    private readonly relationshipRepository: Repository<DataMartRelationship>,
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    private readonly triggerService: DataQualityRunTriggerService,
    private readonly consumptionService: DataQualityConsumptionService,
    private readonly systemClock: SystemTimeService
  ) {}

  async getConfig(dataMartId: string, projectId: string): Promise<DataQualityConfigState> {
    const dataMart = await this.findDataMart(this.dataMartRepository, dataMartId, projectId);
    const relationships = await this.findRelationshipSnapshots(
      this.relationshipRepository,
      dataMartId
    );
    return {
      savedConfig: dataMart.dataQualityConfig ?? null,
      effectiveConfig: resolveEffectiveDataQualityConfig(
        dataMart.dataQualityConfig,
        dataMart.schema,
        relationships
      ),
      relationshipSnapshots: relationships,
    };
  }

  async replaceConfig(
    dataMartId: string,
    projectId: string,
    config: DataQualityConfig | null
  ): Promise<EffectiveDataQualityConfig> {
    const parsedConfig = config === null ? null : DataQualityConfigSchema.parse(config);
    return this.dataSource.transaction(async manager => {
      const dataMartRepository = manager.getRepository(DataMart);
      const relationshipRepository = manager.getRepository(DataMartRelationship);
      const dataMart = await this.findDataMart(dataMartRepository, dataMartId, projectId, true);
      const relationships = await this.findRelationshipSnapshots(
        relationshipRepository,
        dataMartId
      );
      dataMart.dataQualityConfig = parsedConfig;
      await dataMartRepository.save(dataMart);
      return resolveEffectiveDataQualityConfig(parsedConfig, dataMart.schema, relationships);
    });
  }

  async enqueue(command: EnqueueDataQualityRunCommand): Promise<EnqueuedDataQualityRun> {
    const hasReplacementConfig = Object.prototype.hasOwnProperty.call(command, 'config');
    const replacementConfig = hasReplacementConfig
      ? command.config === null
        ? null
        : DataQualityConfigSchema.parse(command.config)
      : undefined;

    return this.dataSource.transaction(async manager => {
      const dataMartRepository = manager.getRepository(DataMart);
      const relationshipRepository = manager.getRepository(DataMartRelationship);
      const dataMartRunRepository = manager.getRepository(DataMartRun);
      const dataMart = await this.findDataMart(
        dataMartRepository,
        command.dataMartId,
        command.projectId,
        true
      );

      this.validatePublishedWithOutputSchema(dataMart);
      const relationships = await this.findRelationshipSnapshots(
        relationshipRepository,
        dataMart.id,
        command.relationshipTargetAccess
      );
      const savedConfig = hasReplacementConfig
        ? (replacementConfig ?? null)
        : (dataMart.dataQualityConfig ?? null);
      const effectiveConfig = resolveEffectiveDataQualityConfig(
        savedConfig,
        dataMart.schema,
        relationships
      );
      const applicableEnabledChecks = effectiveConfig.rules.filter(
        rule => rule.enabled && rule.isApplicable
      );
      if (applicableEnabledChecks.length === 0) {
        throw new ConflictException({
          code: 'DATA_QUALITY_NO_APPLICABLE_CHECKS',
          message: 'Data Quality run requires at least one applicable enabled check',
        });
      }

      const activeRun = await dataMartRunRepository.findOne({
        where: {
          dataMartId: dataMart.id,
          type: DataMartRunType.DATA_QUALITY,
          status: In([DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING]),
        },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
      if (activeRun) {
        throw new ConflictException({
          code: 'DATA_QUALITY_RUN_ACTIVE',
          message: 'A Data Quality run is already active for this Data Mart',
          activeRunId: activeRun.id,
        });
      }

      if (hasReplacementConfig) {
        dataMart.dataQualityConfig = replacementConfig ?? null;
        await dataMartRepository.save(dataMart);
      }

      const enabledChecks = effectiveConfig.rules.filter(rule => rule.enabled).length;
      const dataMartRun = await dataMartRunRepository.save(
        dataMartRunRepository.create({
          id: uuidv7(),
          dataMartId: dataMart.id,
          type: DataMartRunType.DATA_QUALITY,
          status: DataMartRunStatus.PENDING,
          createdById: command.createdById,
          runType: command.runType,
          definitionRun: cloneJson(dataMart.definition!),
          logs: [],
          errors: [],
          dataQualitySnapshot: {
            config: cloneJson(effectiveConfig),
            schema: cloneJson(dataMart.schema!),
            relationships: cloneJson(relationships),
            definitionType: dataMart.definitionType!,
            timezone: effectiveConfig.timezone,
          },
          dataQualitySummary: createDataQualityLifecycleSummary(
            DataQualitySummaryState.QUEUED,
            enabledChecks
          ),
          dataQualityResults: [],
          dataQualityConsumptionPublishedAt: null,
        })
      );
      await this.triggerService.createTrigger(
        {
          createdById: command.createdById,
          projectId: command.projectId,
          dataMartRunId: dataMartRun.id,
          runType: command.runType,
        },
        manager
      );
      return { dataMartRunId: dataMartRun.id };
    });
  }

  async getLatest(dataMartId: string): Promise<DataMartRun | null> {
    return this.dataMartRunRepository.findOne({
      where: { dataMartId, type: DataMartRunType.DATA_QUALITY },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async getActiveRunId(dataMartId: string): Promise<string | null> {
    const active = await this.dataMartRunRepository.findOne({
      where: {
        dataMartId,
        type: DataMartRunType.DATA_QUALITY,
        status: In([DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING]),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return active?.id ?? null;
  }

  async cancelActiveRun(dataMartRunId: string, dataMartId: string): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const runRepository = manager.getRepository(DataMartRun);
      const query = runRepository
        .createQueryBuilder('run')
        .addSelect('run.dataQualitySnapshot')
        .addSelect('run.dataQualityResults')
        .addSelect('run.dataQualityConsumptionPublishedAt')
        .innerJoinAndSelect('run.dataMart', 'dataMart')
        .innerJoinAndSelect('dataMart.storage', 'storage')
        .where('run.id = :dataMartRunId', { dataMartRunId })
        .andWhere('run.dataMartId = :dataMartId', { dataMartId })
        .andWhere('run.type = :type', { type: DataMartRunType.DATA_QUALITY });
      const canLock = ['mysql', 'mariadb'].includes(String(this.dataSource.options.type));
      if (canLock) query.setLock('pessimistic_write');
      const run = await query.getOne();
      if (!run) throw new NotFoundException('Data mart run not found');
      if (![DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING].includes(run.status)) {
        throw new ConflictException(`Cannot cancel data mart run in ${run.status} status`);
      }
      if (!run.dataQualitySummary) {
        throw new ConflictException('Data Quality run is missing its summary');
      }

      // The run lock is always acquired before the trigger lock. Workers use the same order.
      const trigger = await this.triggerService.findForCancellation(
        dataMartRunId,
        manager,
        canLock
      );
      if (run.status === DataMartRunStatus.RUNNING) {
        await this.consumptionService.settle(manager, run);
      }

      const summary = aggregateDataQualitySummary(
        run.dataQualityResults ?? [],
        run.dataQualitySummary.enabledChecks
      );
      summary.state = DataQualitySummaryState.CANCELLED;
      run.dataQualitySummary = summary;
      run.status = DataMartRunStatus.CANCELLED;
      run.finishedAt = this.systemClock.now();
      run.errors = (run.dataQualityResults ?? [])
        .filter(result => result.status === DataQualityCheckStatus.ERROR)
        .map(result => result.error?.message ?? result.description);
      await runRepository.save(run);
      await this.triggerService.requestCancellation(trigger, manager);
    });
  }

  async terminalizeOrphanedRun(
    dataMartRunId: string,
    error: string,
    finishedAt: Date
  ): Promise<boolean> {
    return this.dataSource.transaction(async manager => {
      const runRepository = manager.getRepository(DataMartRun);
      const query = runRepository
        .createQueryBuilder('run')
        .addSelect('run.dataQualitySnapshot')
        .addSelect('run.dataQualityResults')
        .addSelect('run.dataQualityConsumptionPublishedAt')
        .innerJoinAndSelect('run.dataMart', 'dataMart')
        .innerJoinAndSelect('dataMart.storage', 'storage')
        .where('run.id = :dataMartRunId', { dataMartRunId })
        .andWhere('run.type = :type', { type: DataMartRunType.DATA_QUALITY });
      const canLock = ['mysql', 'mariadb'].includes(String(this.dataSource.options.type));
      if (canLock) query.setLock('pessimistic_write');
      const run = await query.getOne();
      if (!run || ![DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING].includes(run.status)) {
        return false;
      }
      if (!run.dataQualitySummary) {
        throw new ConflictException('Data Quality run is missing its summary');
      }

      // Recheck trigger absence while holding the run lock. A recovered trigger must win over
      // cleanup, and all cancellation/cleanup paths acquire run before trigger.
      const trigger = await this.triggerService.findForCancellation(
        dataMartRunId,
        manager,
        canLock
      );
      if (trigger) return false;
      if (run.status === DataMartRunStatus.RUNNING) {
        await this.consumptionService.settle(manager, run);
      }

      const summary = aggregateDataQualitySummary(
        run.dataQualityResults ?? [],
        run.dataQualitySummary.enabledChecks
      );
      summary.state = DataQualitySummaryState.EXECUTION_FAILED;
      run.dataQualitySummary = summary;
      run.status = DataMartRunStatus.FAILED;
      run.errors = [error];
      run.finishedAt = finishedAt;
      await runRepository.save(run);
      return true;
    });
  }

  async markAsCancelled(dataMartRunId: string, finishedAt: Date): Promise<void> {
    await this.markAsTerminal(dataMartRunId, DataQualitySummaryState.CANCELLED, finishedAt);
  }

  async markAsExecutionFailed(dataMartRunId: string, finishedAt: Date): Promise<void> {
    await this.markAsTerminal(dataMartRunId, DataQualitySummaryState.EXECUTION_FAILED, finishedAt);
  }

  async markRunAndSummaryAsExecutionFailed(
    dataMartRunId: string,
    expectedProjectId: string,
    error: unknown,
    finishedAt: Date,
    ownership?: TriggerExecutionOwnership
  ): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const runRepository = manager.getRepository(DataMartRun);
      const canLock = ['mysql', 'mariadb'].includes(String(this.dataSource.options.type));
      const run = await runRepository.findOne({
        where: {
          id: dataMartRunId,
          type: DataMartRunType.DATA_QUALITY,
          dataMart: { projectId: expectedProjectId },
        },
        ...(canLock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });
      if (!run || ![DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING].includes(run.status)) {
        return;
      }
      await ownership?.assertOwned(manager);

      if (run.dataQualitySummary) {
        run.dataQualitySummary = {
          ...run.dataQualitySummary,
          state: DataQualitySummaryState.EXECUTION_FAILED,
        };
      }

      run.status = DataMartRunStatus.FAILED;
      run.errors = [error instanceof Error ? error.message : String(error)];
      run.finishedAt = finishedAt;
      await runRepository.save(run);
    });
  }

  private async markAsTerminal(
    dataMartRunId: string,
    state: DataQualitySummaryState,
    finishedAt: Date
  ): Promise<void> {
    const run = await this.dataMartRunRepository.findOne({
      where: { id: dataMartRunId, type: DataMartRunType.DATA_QUALITY },
    });
    if (!run?.dataQualitySummary) return;
    run.dataQualitySummary = {
      ...run.dataQualitySummary,
      state,
    };
    run.finishedAt = finishedAt;
    await this.dataMartRunRepository.save(run);
  }

  async getDetail(dataMartId: string, runId: string): Promise<DataMartRun | null> {
    return this.dataMartRunRepository
      .createQueryBuilder('run')
      .addSelect('run.dataQualitySnapshot')
      .addSelect('run.dataQualityResults')
      .addSelect('run.dataQualityConsumptionPublishedAt')
      .where('run.id = :runId', { runId })
      .andWhere('run.dataMartId = :dataMartId', { dataMartId })
      .andWhere('run.type = :type', { type: DataMartRunType.DATA_QUALITY })
      .getOne();
  }

  private async findDataMart(
    repository: Repository<DataMart>,
    dataMartId: string,
    projectId: string,
    lock = false
  ): Promise<DataMart> {
    const canLock = ['mysql', 'mariadb'].includes(String(this.dataSource.options.type));
    const dataMart = await repository.findOne({
      where: { id: dataMartId, projectId },
      ...(lock && canLock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!dataMart) throw new NotFoundException('Data Mart not found');
    return dataMart;
  }

  private async findRelationshipSnapshots(
    repository: Repository<DataMartRelationship>,
    sourceDataMartId: string,
    targetAccess?: ReadonlyMap<string, boolean>
  ): Promise<DataQualityRelationshipSnapshot[]> {
    const relationships = await repository.find({
      where: { sourceDataMart: { id: sourceDataMartId } },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return relationships.map(relationship => ({
      id: relationship.id,
      sourceDataMartId,
      targetDataMartId: relationship.targetDataMart.id,
      targetAlias: relationship.targetAlias,
      joinConditions: cloneJson(relationship.joinConditions),
      ...(targetAccess
        ? { targetAccessible: targetAccess.get(relationship.targetDataMart.id) === true }
        : {}),
    }));
  }

  private validatePublishedWithOutputSchema(dataMart: DataMart): void {
    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new ConflictException({
        code: 'DATA_QUALITY_NOT_PUBLISHED',
        message: 'Data Quality runs require a published Data Mart',
      });
    }
    if (!dataMart.schema) {
      throw new ConflictException({
        code: 'DATA_QUALITY_OUTPUT_SCHEMA_REQUIRED',
        message: 'Data Quality runs require an Output Schema',
      });
    }
    if (!dataMart.definition || !dataMart.definitionType) {
      throw new ConflictException({
        code: 'DATA_QUALITY_DEFINITION_REQUIRED',
        message: 'Data Quality runs require a Data Mart definition and definition type',
      });
    }
  }
}

export function createDataQualityLifecycleSummary(
  state: DataQualitySummaryState,
  enabledChecks: number
): DataQualitySummary {
  return {
    state,
    enabledChecks,
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
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
