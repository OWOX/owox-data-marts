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
import { applyDataDestinationVisibilityFilter } from '../../utils/apply-data-destination-visibility-filter';
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
const DESTINATION_JOIN_ALIAS = 'dd';

export interface ReportSearchParent {
  entityType: SearchableEntityType.DATA_MART | SearchableEntityType.DATA_DESTINATION;
  entityId: string;
}

function toDescriptor(report: Report): EntityScoringDescriptor {
  const { dataMart, dataDestination } = report;
  const title = report.title || dataDestination.title;
  const typeLabel = toHumanReadable(dataDestination.type as DataDestinationType);
  const contextTexts = [dataMart.title, dataDestination.title, typeLabel];
  const richTextSlots: RichTextSlot[] = [
    { kind: 'title', text: title },
    ...contextTexts.map((text): RichTextSlot => ({ kind: 'context', text })),
  ];

  return {
    entityType: SearchableEntityType.REPORT,
    entityId: report.id,
    projectId: dataMart.projectId,
    title,
    description: null,
    richTextSlots,
    atomicTokenSlots: [],
    fieldCount: 0,
    extendability: 0,
    modifiedAt: report.modifiedAt,
    embeddingText: [title, ...contextTexts].filter(Boolean).join('\n'),
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
        `JOIN data_mart ${DATA_MART_JOIN_ALIAS} ON ${DATA_MART_JOIN_ALIAS}.id = ${REPORT_JOIN_ALIAS}.dataMartId AND ${DATA_MART_JOIN_ALIAS}.projectId = ${indexAlias}.project_id ` +
        `JOIN data_destination ${DESTINATION_JOIN_ALIAS} ON ${DESTINATION_JOIN_ALIAS}.id = ${REPORT_JOIN_ALIAS}.dataDestinationId AND ${DESTINATION_JOIN_ALIAS}.projectId = ${indexAlias}.project_id`,
      extraClauses: [
        `${DATA_MART_JOIN_ALIAS}.deletedAt IS NULL`,
        `${DESTINATION_JOIN_ALIAS}.deletedAt IS NULL`,
      ],
      applyFilter: (qb, options) => {
        applyDataMartVisibilityFilter(qb, {
          ...options,
          dataMartAlias: DATA_MART_JOIN_ALIAS,
        });
        applyDataDestinationVisibilityFilter(qb, {
          ...options,
          destinationAlias: DESTINATION_JOIN_ALIAS,
        });
      },
      contextAccessService,
    });
  }

  async listSearchablePage(
    projectId: string,
    cursor: PageCursor | null,
    limit: number,
    parent?: ReportSearchParent
  ): Promise<SearchablePage> {
    const where = buildKeysetWhere<Report>(
      {
        dataMart: {
          projectId,
          deletedAt: IsNull(),
          ...(parent?.entityType === SearchableEntityType.DATA_MART ? { id: parent.entityId } : {}),
        },
        ...(parent?.entityType === SearchableEntityType.DATA_DESTINATION
          ? { dataDestination: { id: parent.entityId } }
          : {}),
      },
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
    return {
      descriptors: await this.loadSearchableByIds(projectId, pageIds),
      nextCursor: nextPageCursor(pageRows, limit),
    };
  }

  async loadSearchableByIds(
    projectId: string,
    pageIds: string[]
  ): Promise<EntityScoringDescriptor[]> {
    if (pageIds.length === 0) return [];
    const reports = await this.reportRepo.find({
      where: { id: In(pageIds), dataMart: { projectId, deletedAt: IsNull() } },
      select: {
        id: true,
        title: true,
        modifiedAt: true,
        dataMart: { id: true, title: true, projectId: true },
        dataDestination: { id: true, title: true, type: true },
      },
      relations: { dataMart: true, dataDestination: true },
      loadEagerRelations: false,
    });
    const reportById = new Map(reports.map(report => [report.id, report]));
    return pageIds
      .map(id => reportById.get(id))
      .filter((report): report is Report => report?.dataDestination != null)
      .map(toDescriptor);
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
