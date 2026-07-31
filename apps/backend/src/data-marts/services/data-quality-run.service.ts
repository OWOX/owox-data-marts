import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { RunType } from '../../common/scheduler/shared/types';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import {
  DataQualityConfig,
  DataQualityConfigSchema,
  EffectiveDataQualityConfig,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import {
  DataQualityRelationshipSnapshot,
  DataQualityRelationshipTargetSnapshot,
  DataQualitySummary,
} from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { resolveEffectiveDataQualityConfig } from './data-quality-config-resolver';
import { DataQualityRunTriggerService } from './data-quality-run-trigger.service';
import { aggregateDataQualitySummary } from '../data-quality/data-quality-result-parser';
import { createDataQualityConfigRevision } from '../data-quality/data-quality-config-revision';

export const DATA_QUALITY_RUN_EXECUTION_ERROR_MESSAGE = 'Data Quality run failed during execution';

interface EnqueueDataQualityRunCommand {
  dataMartId: string;
  projectId: string;
  createdById: string;
  runType: RunType;
  relationshipTargetAccess: ReadonlyMap<string, boolean>;
  expectedConfigRevision?: string;
}

export interface EnqueuedDataQualityRun {
  dataMartRunId: string;
}

export interface DataQualityConfigState {
  savedConfig: DataQualityConfig | null;
  effectiveConfig: EffectiveDataQualityConfig;
  relationshipSnapshots: DataQualityRelationshipSnapshot[];
  configRevision: string;
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
    private readonly systemClock: SystemTimeService
  ) {}

  async getConfig(dataMartId: string, projectId: string): Promise<DataQualityConfigState> {
    const dataMart = await this.findDataMart(this.dataMartRepository, dataMartId, projectId);
    const relationshipEntities = await this.findRelationships(
      this.relationshipRepository,
      dataMartId
    );
    const relationships = this.toRelationshipSnapshots(relationshipEntities, dataMartId);
    const savedConfig = dataMart.dataQualityConfig ?? null;
    const effectiveConfig = resolveEffectiveDataQualityConfig(
      savedConfig,
      dataMart.schema,
      relationships
    );
    return {
      savedConfig,
      effectiveConfig,
      relationshipSnapshots: relationships,
      configRevision: createDataQualityConfigRevision({
        effectiveConfig,
        schema: dataMart.schema,
        relationships,
      }),
    };
  }

  async replaceConfig(
    dataMartId: string,
    projectId: string,
    config: DataQualityConfig | null
  ): Promise<DataQualityConfigState> {
    const parsedConfig = config === null ? null : DataQualityConfigSchema.parse(config);
    return this.dataSource.transaction(async manager => {
      const dataMartRepository = manager.getRepository(DataMart);
      const relationshipRepository = manager.getRepository(DataMartRelationship);
      const dataMart = await this.findDataMart(dataMartRepository, dataMartId, projectId, true);
      const relationshipEntities = await this.findRelationships(relationshipRepository, dataMartId);
      const relationships = this.toRelationshipSnapshots(relationshipEntities, dataMartId);
      dataMart.dataQualityConfig = parsedConfig;
      await dataMartRepository.save(dataMart);
      const effectiveConfig = resolveEffectiveDataQualityConfig(
        parsedConfig,
        dataMart.schema,
        relationships
      );
      return {
        savedConfig: parsedConfig,
        effectiveConfig,
        relationshipSnapshots: relationships,
        configRevision: createDataQualityConfigRevision({
          effectiveConfig,
          schema: dataMart.schema,
          relationships,
        }),
      };
    });
  }

  async enqueue(command: EnqueueDataQualityRunCommand): Promise<EnqueuedDataQualityRun> {
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

      const relationshipEntities = await this.findRelationships(
        relationshipRepository,
        dataMart.id
      );
      const privilegeNeutralRelationships = this.toRelationshipSnapshots(
        relationshipEntities,
        dataMart.id
      );
      const savedConfig = dataMart.dataQualityConfig ?? null;
      const privilegeNeutralConfig = resolveEffectiveDataQualityConfig(
        savedConfig,
        dataMart.schema,
        privilegeNeutralRelationships
      );
      const currentConfigRevision = createDataQualityConfigRevision({
        effectiveConfig: privilegeNeutralConfig,
        schema: dataMart.schema,
        relationships: privilegeNeutralRelationships,
      });
      if (
        command.expectedConfigRevision &&
        command.expectedConfigRevision !== currentConfigRevision
      ) {
        throw new ConflictException({
          code: 'DATA_QUALITY_CONFIG_REVISION_CONFLICT',
          message: 'Data Quality configuration changed before the run could be queued',
          expectedConfigRevision: command.expectedConfigRevision,
          currentConfigRevision,
        });
      }

      this.validatePublishedWithOutputSchema(dataMart);
      const relationships = this.toRelationshipSnapshots(
        relationshipEntities,
        dataMart.id,
        command.relationshipTargetAccess
      );
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

      const enabledRules = effectiveConfig.rules.filter(rule => rule.enabled);
      const enabledRelationshipIds = new Set(
        enabledRules.flatMap(rule =>
          rule.scope.type === DataQualityScope.RELATIONSHIP ? [rule.scope.relationshipId] : []
        )
      );
      const applicableEnabledRelationshipIds = new Set(
        applicableEnabledChecks.flatMap(rule =>
          rule.scope.type === DataQualityScope.RELATIONSHIP ? [rule.scope.relationshipId] : []
        )
      );
      const snapshotConfig = { ...effectiveConfig, rules: enabledRules };
      const snapshotRelationships = relationships.filter(relationship =>
        enabledRelationshipIds.has(relationship.id)
      );
      const relationshipTargets = this.createRelationshipTargetSnapshots(
        relationshipEntities,
        snapshotRelationships.filter(relationship =>
          applicableEnabledRelationshipIds.has(relationship.id)
        )
      );
      const enabledChecks = enabledRules.length;
      const dataMartRun = await dataMartRunRepository.save(
        dataMartRunRepository.create({
          dataMartId: dataMart.id,
          type: DataMartRunType.DATA_QUALITY,
          status: DataMartRunStatus.PENDING,
          createdById: command.createdById,
          runType: command.runType,
          definitionRun: cloneJson(dataMart.definition!),
          logs: [],
          errors: [],
          dataQualitySnapshot: {
            config: cloneJson(snapshotConfig),
            schema: cloneJson(dataMart.schema!),
            relationships: cloneJson(snapshotRelationships),
            definitionType: dataMart.definitionType!,
            sourceStorage: {
              id: dataMart.storage.id,
              type: dataMart.storage.type,
            },
            relationshipTargets: cloneJson(relationshipTargets),
          },
          dataQualitySummary: createDataQualityLifecycleSummary(
            DataQualitySummaryState.QUEUED,
            enabledChecks
          ),
          dataQualityResults: [],
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
      select: {
        id: true,
        dataQualitySummary: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
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
      select: { id: true },
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

      const trigger = await this.triggerService.findForCancellation(
        dataMartRunId,
        manager,
        canLock
      );
      const summary = aggregateDataQualitySummary(
        run.dataQualityResults ?? [],
        run.dataQualitySummary.enabledChecks
      );
      summary.state = DataQualitySummaryState.CANCELLED;
      run.dataQualitySummary = summary;
      run.status = DataMartRunStatus.CANCELLED;
      run.finishedAt = this.systemClock.now();
      run.errors = createDataQualityRunErrors(run.dataQualityResults ?? []);
      await runRepository.save(run);
      await this.triggerService.requestCancellation(trigger, manager);
    });
  }

  async markRunAndSummaryAsExecutionFailed(
    dataMartRunId: string,
    expectedProjectId: string,
    _error: unknown,
    finishedAt: Date
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
      if (run.dataQualitySummary) {
        run.dataQualitySummary = {
          ...run.dataQualitySummary,
          state: DataQualitySummaryState.EXECUTION_FAILED,
        };
      }

      run.status = DataMartRunStatus.FAILED;
      run.errors = [DATA_QUALITY_RUN_EXECUTION_ERROR_MESSAGE];
      run.finishedAt = finishedAt;
      await runRepository.save(run);
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

  private async findRelationships(
    repository: Repository<DataMartRelationship>,
    sourceDataMartId: string
  ): Promise<DataMartRelationship[]> {
    return repository.find({
      where: { sourceDataMart: { id: sourceDataMartId } },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }

  private toRelationshipSnapshots(
    relationships: readonly DataMartRelationship[],
    sourceDataMartId: string,
    targetAccess?: ReadonlyMap<string, boolean>
  ): DataQualityRelationshipSnapshot[] {
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

  private createRelationshipTargetSnapshots(
    relationships: readonly DataMartRelationship[],
    snapshotRelationships: readonly DataQualityRelationshipSnapshot[]
  ): DataQualityRelationshipTargetSnapshot[] {
    const entityById = new Map(relationships.map(relationship => [relationship.id, relationship]));
    return snapshotRelationships
      .filter(relationship => relationship.targetAccessible === true)
      .map(relationship => {
        const target = entityById.get(relationship.id)?.targetDataMart;
        if (!target?.storage) {
          throw new ConflictException({
            code: 'DATA_QUALITY_RELATIONSHIP_TARGET_UNAVAILABLE',
            message: 'A Data Quality relationship target is unavailable',
          });
        }
        return {
          relationshipId: relationship.id,
          targetDataMartId: relationship.targetDataMartId,
          definition: target.definition ? cloneJson(target.definition) : null,
          schema: target.schema ? cloneJson(target.schema) : null,
          storage: {
            id: target.storage.id,
            type: target.storage.type,
          },
        };
      });
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

function createDataQualityRunErrors(
  results: readonly { status: DataQualityCheckStatus }[]
): string[] {
  return results.some(result => result.status === DataQualityCheckStatus.ERROR)
    ? [DATA_QUALITY_RUN_EXECUTION_ERROR_MESSAGE]
    : [];
}
