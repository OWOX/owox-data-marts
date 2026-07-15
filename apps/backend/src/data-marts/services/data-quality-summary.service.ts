import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataQualitySummaryDto } from '../dto/domain/data-quality.dto';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityRun } from '../entities/data-quality-run.entity';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { resolveEffectiveDataQualityConfig } from './data-quality-config-resolver';

@Injectable()
export class DataQualitySummaryService {
  constructor(
    @InjectRepository(DataQualityRun)
    private readonly repository: Repository<DataQualityRun>,
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
      .createQueryBuilder('dataQualityRun')
      .innerJoinAndSelect('dataQualityRun.dataMartRun', 'dataMartRun')
      .innerJoin('dataMartRun.dataMart', 'dataMart')
      .leftJoin(
        DataMartRun,
        'newerRun',
        `newerRun.dataMartId = dataMartRun.dataMartId
          AND newerRun.type = :dataQualityRunType
          AND (
            newerRun.createdAt > dataMartRun.createdAt
            OR (newerRun.createdAt = dataMartRun.createdAt AND newerRun.id > dataMartRun.id)
          )`
      )
      .where('dataMartRun.dataMartId IN (:...dataMartIds)')
      .andWhere('dataMartRun.type = :dataQualityRunType')
      .andWhere('dataMart.projectId = :projectId')
      .andWhere('newerRun.id IS NULL')
      .setParameters({
        dataMartIds: ids,
        dataQualityRunType: DataMartRunType.DATA_QUALITY,
        projectId,
      })
      .getMany();

    return new Map(
      runs.map(run => [run.dataMartRun.dataMartId, toCompactDataQualitySummary(run)] as const)
    );
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
        relationships,
        dataMart.definitionType
      );
      const enabledChecks = effective.rules.filter(rule => rule.enabled).length;
      latest.set(dataMart.id, createNoRunDataQualitySummary(enabledChecks));
    }

    return latest;
  }
}

export function toCompactDataQualitySummary(run: DataQualityRun): DataQualitySummaryDto {
  return {
    ...run.summary,
    dataMartRunId: run.dataMartRun.id,
    lastRunAt:
      run.dataMartRun.finishedAt ?? run.dataMartRun.startedAt ?? run.dataMartRun.createdAt ?? null,
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
