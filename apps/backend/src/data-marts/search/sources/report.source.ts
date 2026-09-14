import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { SearchableEntityType } from '../../../common/search/search.facade';
import {
  DataDestinationType,
  toHumanReadable,
} from '../../data-destination-types/enums/data-destination-type.enum';
import { DataMart } from '../../entities/data-mart.entity';
import { Report } from '../../entities/report.entity';
import { ContextAccessService } from '../../services/context/context-access.service';
import { applyDataMartVisibilityFilter } from '../../utils/apply-data-mart-visibility-filter';
import { DATA_MART_SCORING_CONFIG, type ScoringConfig } from '../engine/scoring-config';
import type { EntityScoringDescriptor, RichTextSlot } from '../indexing/entity-scoring-descriptor';
import { EntityAccessPredicateProvider } from './access-predicate';
import type {
  AccessPredicateProvider,
  IndexableSource,
  PageCursor,
  SearchablePage,
} from './indexable-source.port';
import { buildKeysetWhere, nextPageCursor } from './indexable-source.port';

const REPORT_JOIN_ALIAS = 'rp';
const DATA_MART_JOIN_ALIAS = 'dm';

function toDescriptor(report: Report): EntityScoringDescriptor {
  const { dataMart, dataDestination } = report;
  const typeLabel = toHumanReadable(dataDestination.type as DataDestinationType);
  const contextTexts = [dataMart.title, dataDestination.title, typeLabel];
  const richTextSlots: RichTextSlot[] = [
    { kind: 'title', text: report.title },
    ...contextTexts.map((text): RichTextSlot => ({ kind: 'context', text })),
  ];

  return {
    entityType: SearchableEntityType.REPORT,
    entityId: report.id,
    projectId: dataMart.projectId,
    title: report.title,
    description: null,
    richTextSlots,
    atomicTokenSlots: [],
    fieldCount: 0,
    extendability: 0,
    modifiedAt: report.modifiedAt,
    embeddingText: [report.title, ...contextTexts].filter(Boolean).join('\n'),
    isDraft: false,
    report: {
      dataMart: { id: dataMart.id, title: dataMart.title },
      dataDestination: {
        id: dataDestination.id,
        title: dataDestination.title,
        type: dataDestination.type,
      },
    },
  };
}

@Injectable()
export class ReportIndexableSource implements IndexableSource {
  readonly entityType = SearchableEntityType.REPORT;
  readonly scoringConfig: ScoringConfig = DATA_MART_SCORING_CONFIG;
  readonly accessPredicateProvider: AccessPredicateProvider;

  constructor(
    @InjectRepository(Report) private readonly reportRepo: Repository<Report>,
    @InjectRepository(DataMart) dataMartRepo: Repository<DataMart>,
    contextAccessService: ContextAccessService
  ) {
    this.accessPredicateProvider = new EntityAccessPredicateProvider({
      repo: dataMartRepo,
      joinAlias: DATA_MART_JOIN_ALIAS,
      joinSql: indexAlias =>
        `JOIN report ${REPORT_JOIN_ALIAS} ON ${REPORT_JOIN_ALIAS}.id = ${indexAlias}.entity_id ` +
        `JOIN data_mart ${DATA_MART_JOIN_ALIAS} ON ${DATA_MART_JOIN_ALIAS}.id = ${REPORT_JOIN_ALIAS}.dataMartId AND ${DATA_MART_JOIN_ALIAS}.projectId = ${indexAlias}.project_id`,
      extraClauses: [`${DATA_MART_JOIN_ALIAS}.deletedAt IS NULL`],
      applyFilter: (qb, { projectId, userId, roles, roleScope }) =>
        applyDataMartVisibilityFilter(qb, {
          dataMartAlias: DATA_MART_JOIN_ALIAS,
          projectId,
          userId,
          roles,
          roleScope,
        }),
      contextAccessService,
    });
  }

  async listSearchablePage(
    projectId: string,
    cursor: PageCursor | null,
    limit: number
  ): Promise<SearchablePage> {
    const where = buildKeysetWhere<Report>(
      { dataMart: { projectId, deletedAt: IsNull() } },
      cursor
    );

    const pageRows = await this.reportRepo.find({
      where,
      select: { id: true, createdAt: true },
      loadEagerRelations: false,
      order: { createdAt: 'ASC', id: 'ASC' },
      take: limit,
    });
    if (pageRows.length === 0) return { descriptors: [], nextCursor: null };

    const pageIds = pageRows.map(report => report.id);
    const reports = await this.reportRepo.find({
      where: { id: In(pageIds), dataMart: { projectId, deletedAt: IsNull() } },
      relations: { dataMart: true, dataDestination: true },
      loadEagerRelations: false,
    });
    const reportById = new Map(reports.map(report => [report.id, report]));
    const descriptors = pageIds
      .map(id => reportById.get(id))
      .filter((report): report is Report => report?.dataDestination !== undefined)
      .map(toDescriptor);

    return { descriptors, nextCursor: nextPageCursor(pageRows, limit) };
  }

  async listProjectIds(): Promise<string[]> {
    const rows: { projectId: string }[] = await this.reportRepo
      .createQueryBuilder(REPORT_JOIN_ALIAS)
      .innerJoin(`${REPORT_JOIN_ALIAS}.dataMart`, DATA_MART_JOIN_ALIAS)
      .select(`DISTINCT ${DATA_MART_JOIN_ALIAS}.projectId`, 'projectId')
      .where(`${DATA_MART_JOIN_ALIAS}.deletedAt IS NULL`)
      .getRawMany();
    return rows.map(r => r.projectId);
  }

  async loadSearchableOne(entityId: string): Promise<EntityScoringDescriptor | null> {
    const report = await this.reportRepo
      .createQueryBuilder(REPORT_JOIN_ALIAS)
      .innerJoinAndSelect(`${REPORT_JOIN_ALIAS}.dataMart`, DATA_MART_JOIN_ALIAS)
      .innerJoinAndSelect(`${REPORT_JOIN_ALIAS}.dataDestination`, 'dd')
      .where(`${REPORT_JOIN_ALIAS}.id = :id`, { id: entityId })
      .andWhere(`${DATA_MART_JOIN_ALIAS}.deletedAt IS NULL`)
      .getOne();
    if (!report) return null;

    return toDescriptor(report);
  }
}
