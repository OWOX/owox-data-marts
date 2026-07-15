import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { RunType } from '../../common/scheduler/shared/types';
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
import { DataQualityCheckResult } from '../entities/data-quality-check-result.entity';
import { DataQualityRun } from '../entities/data-quality-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { resolveEffectiveDataQualityConfig } from './data-quality-config-resolver';
import { DataQualityRunTriggerService } from './data-quality-run-trigger.service';

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
    @InjectRepository(DataQualityRun)
    private readonly dataQualityRunRepository: Repository<DataQualityRun>,
    @InjectRepository(DataQualityCheckResult)
    private readonly resultRepository: Repository<DataQualityCheckResult>,
    private readonly triggerService: DataQualityRunTriggerService
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
        relationships,
        dataMart.definitionType
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
      return resolveEffectiveDataQualityConfig(
        parsedConfig,
        dataMart.schema,
        relationships,
        dataMart.definitionType
      );
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
      const dataQualityRunRepository = manager.getRepository(DataQualityRun);
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
        relationships,
        dataMart.definitionType
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
        })
      );
      const enabledChecks = effectiveConfig.rules.filter(rule => rule.enabled).length;
      await dataQualityRunRepository.save(
        dataQualityRunRepository.create({
          id: uuidv7(),
          dataMartRunId: dataMartRun.id,
          configSnapshot: cloneJson(effectiveConfig),
          schemaSnapshot: cloneJson(dataMart.schema!),
          relationshipSnapshots: cloneJson(relationships),
          definitionTypeSnapshot: dataMart.definitionType!,
          timezone: effectiveConfig.timezone,
          summary: createDataQualityLifecycleSummary(DataQualitySummaryState.QUEUED, enabledChecks),
          startedAt: null,
          finishedAt: null,
          consumptionPublishedAt: null,
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

  async getLatest(dataMartId: string): Promise<DataQualityRun | null> {
    return this.dataQualityRunRepository.findOne({
      where: { dataMartRun: { dataMartId, type: DataMartRunType.DATA_QUALITY } },
      relations: { dataMartRun: true },
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

  async markAsCancelled(dataMartRunId: string, finishedAt: Date): Promise<void> {
    await this.markAsTerminal(dataMartRunId, DataQualitySummaryState.CANCELLED, finishedAt);
  }

  async markAsExecutionFailed(dataMartRunId: string, finishedAt: Date): Promise<void> {
    await this.markAsTerminal(dataMartRunId, DataQualitySummaryState.EXECUTION_FAILED, finishedAt);
  }

  async markRunAndSummaryAsExecutionFailed(
    dataMartRunId: string,
    error: unknown,
    finishedAt: Date
  ): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const runRepository = manager.getRepository(DataMartRun);
      const qualityRunRepository = manager.getRepository(DataQualityRun);
      const run = await runRepository.findOne({
        where: { id: dataMartRunId, type: DataMartRunType.DATA_QUALITY },
      });
      if (!run || ![DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING].includes(run.status)) {
        return;
      }

      const qualityRun = await qualityRunRepository.findOne({ where: { dataMartRunId } });
      if (qualityRun) {
        qualityRun.summary = {
          ...qualityRun.summary,
          state: DataQualitySummaryState.EXECUTION_FAILED,
        };
        qualityRun.finishedAt = finishedAt;
        await qualityRunRepository.save(qualityRun);
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
    const qualityRun = await this.dataQualityRunRepository.findOne({
      where: { dataMartRunId },
    });
    if (!qualityRun) return;
    qualityRun.summary = {
      ...qualityRun.summary,
      state,
    };
    qualityRun.finishedAt = finishedAt;
    await this.dataQualityRunRepository.save(qualityRun);
  }

  async getDetail(dataMartId: string, dataMartRunId: string): Promise<DataQualityRun | null> {
    return this.dataQualityRunRepository.findOne({
      where: {
        dataMartRunId,
        dataMartRun: { dataMartId, type: DataMartRunType.DATA_QUALITY },
      },
      relations: { dataMartRun: true, results: true },
      order: { results: { createdAt: 'ASC' } },
    });
  }

  async listPersistedResults(dataQualityRunId: string): Promise<DataQualityCheckResult[]> {
    return this.resultRepository.find({
      where: { dataQualityRunId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
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
