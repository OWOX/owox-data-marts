import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataQualitySummaryDto } from '../dto/domain/data-quality.dto';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { resolveEffectiveDataQualityConfig } from './data-quality-config-resolver';

@Injectable()
export class DataQualitySummaryService {
  constructor(
    @InjectRepository(DataMartRun)
    private readonly repository: Repository<DataMartRun>,
    private readonly relationshipService: DataMartRelationshipService
  ) {}

  async getLatestByDataMartIds(
    dataMartIds: readonly string[],
    projectId: string
  ): Promise<Map<string, DataQualitySummaryDto>> {
    const ids = Array.from(new Set(dataMartIds));
    if (ids.length === 0) return new Map();

    // Anti-join selects exactly one latest run for each Data Mart. New Data Quality runs use
    // creation-ordered UUIDv7 ids as the tie-breaker when database timestamps have equal precision.
    const runs = await this.repository
      .createQueryBuilder('run')
      .innerJoin('run.dataMart', 'dataMart')
      .leftJoin(
        DataMartRun,
        'newerRun',
        `newerRun.dataMartId = run.dataMartId
          AND newerRun.type = :dataQualityRunType
          AND (
            newerRun.createdAt > run.createdAt
            OR (newerRun.createdAt = run.createdAt AND newerRun.id > run.id)
          )`
      )
      .where('run.dataMartId IN (:...dataMartIds)')
      .andWhere('run.type = :dataQualityRunType')
      .andWhere('dataMart.projectId = :projectId')
      .andWhere('newerRun.id IS NULL')
      .setParameters({
        dataMartIds: ids,
        dataQualityRunType: DataMartRunType.DATA_QUALITY,
        projectId,
      })
      .getMany();

    return new Map(runs.map(run => [run.dataMartId, toCompactDataQualitySummary(run)] as const));
  }

  async getCurrentByDataMarts(
    dataMarts: readonly DataMart[],
    projectId: string
  ): Promise<Map<string, DataQualitySummaryDto>> {
    if (dataMarts.length === 0) return new Map();

    const ids = dataMarts.map(dataMart => dataMart.id);
    const latest = await this.getLatestByDataMartIds(ids, projectId);
    const withoutRun = dataMarts.filter(dataMart => !latest.has(dataMart.id));
    if (withoutRun.length === 0) return latest;

    const edges = await this.relationshipService.findGraphEdgesByProjectIdAndSourceDataMartIds(
      projectId,
      withoutRun.map(dataMart => dataMart.id)
    );
    const edgesBySourceId = new Map<string, typeof edges>();
    for (const edge of edges) {
      const current = edgesBySourceId.get(edge.sourceDataMartId) ?? [];
      current.push(edge);
      edgesBySourceId.set(edge.sourceDataMartId, current);
    }

    for (const dataMart of withoutRun) {
      const relationships = (edgesBySourceId.get(dataMart.id) ?? []).map(edge => ({
        id: edge.id,
        sourceDataMartId: edge.sourceDataMartId,
        targetDataMartId: edge.targetDataMartId,
        targetAlias: edge.targetDataMartId,
        joinConditions: edge.joinConditions,
      }));
      const effective = resolveEffectiveDataQualityConfig(
        dataMart.dataQualityConfig,
        dataMart.schema,
        relationships
      );
      const enabledChecks = effective.rules.filter(rule => rule.enabled).length;
      latest.set(dataMart.id, createNoRunDataQualitySummary(enabledChecks));
    }

    return latest;
  }
}

export function toCompactDataQualitySummary(run: DataMartRun): DataQualitySummaryDto {
  if (!run.dataQualitySummary) {
    throw new Error(`Data Quality run ${run.id} is missing its summary`);
  }
  return {
    ...run.dataQualitySummary,
    dataMartRunId: run.id,
    lastRunAt: run.finishedAt ?? run.startedAt ?? run.createdAt ?? null,
  };
}

export function createNoRunDataQualitySummary(enabledChecks: number): DataQualitySummaryDto {
  return {
    state:
      enabledChecks === 0
        ? DataQualitySummaryState.ALL_DISABLED
        : DataQualitySummaryState.NEVER_RUN,
    dataMartRunId: null,
    lastRunAt: null,
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
