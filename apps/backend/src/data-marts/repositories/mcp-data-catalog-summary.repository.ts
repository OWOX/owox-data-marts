import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { Report } from '../entities/report.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { RoleScope } from '../enums/role-scope.enum';
import { applyDataMartVisibilityFilter } from '../utils/apply-data-mart-visibility-filter';

export interface McpDataCatalogSummaryQuery {
  projectId: string;
  userId: string;
  roles: string[];
  roleScope: RoleScope;
}

export interface McpDataCatalogSummaryRawDataMart {
  id: string;
  title: string;
  description: string | null;
  modifiedAt: Date | string;
}

@Injectable()
export class McpDataCatalogSummaryRepository {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    @InjectRepository(DataMartScheduledTrigger)
    private readonly triggerRepository: Repository<DataMartScheduledTrigger>,
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>
  ) {}

  listPublishedVisibleDataMartRows(
    query: McpDataCatalogSummaryQuery
  ): Promise<McpDataCatalogSummaryRawDataMart[]> {
    return this.buildPublishedVisibleDataMartsQuery(
      query
    ).getRawMany<McpDataCatalogSummaryRawDataMart>();
  }

  async countTriggersByDataMartIds(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();

    const rawCounts = await this.triggerRepository
      .createQueryBuilder('t')
      .leftJoin('t.dataMart', 'dm')
      .where('dm.id IN (:...ids)', { ids })
      .select('dm.id', 'dataMartId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dm.id')
      .getRawMany<{ dataMartId: string; count: string | number }>();

    return this.toCountMap(rawCounts);
  }

  async countReportsByDataMartIds(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();

    const rawCounts = await this.reportRepository
      .createQueryBuilder('r')
      .leftJoin('r.dataMart', 'dm')
      .where('dm.id IN (:...ids)', { ids })
      .select('dm.id', 'dataMartId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dm.id')
      .getRawMany<{ dataMartId: string; count: string | number }>();

    return this.toCountMap(rawCounts);
  }

  private buildPublishedVisibleDataMartsQuery(
    query: McpDataCatalogSummaryQuery
  ): SelectQueryBuilder<DataMart> {
    const qb = this.dataMartRepository
      .createQueryBuilder('dm')
      .select('dm.id', 'id')
      .addSelect('dm.title', 'title')
      .addSelect('dm.description', 'description')
      .addSelect('dm.modifiedAt', 'modifiedAt')
      .where('dm.projectId = :projectId', { projectId: query.projectId })
      .andWhere('dm.deletedAt IS NULL')
      .andWhere('dm.status = :status', { status: DataMartStatus.PUBLISHED })
      .orderBy('dm.modifiedAt', 'DESC');

    applyDataMartVisibilityFilter(qb, {
      dataMartAlias: 'dm',
      projectId: query.projectId,
      userId: query.userId,
      roles: query.roles,
      roleScope: query.roleScope,
    });

    return qb;
  }

  private toCountMap(
    rawCounts: { dataMartId: string; count: string | number }[]
  ): Map<string, number> {
    return new Map(rawCounts.map(row => [row.dataMartId, Number(row.count)]));
  }
}
