import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { DataMart } from '../../entities/data-mart.entity';
import { ContextAccessService } from '../../services/context/context-access.service';
import { applyDataMartVisibilityFilter } from '../../utils/apply-data-mart-visibility-filter';
import {
  DATA_MART_CATALOG,
  type DataMartCatalogPort,
  type RelationshipEdge,
  type SearchableDataMart,
} from '../catalog/data-mart-catalog.port';
import { buildDataMartScoringDescriptor } from '../catalog/data-mart-scoring-descriptor.builder';
import type { EntityScoringDescriptor } from '../indexing/entity-scoring-descriptor';
import { DATA_MART_SCORING_CONFIG, type ScoringConfig } from '../engine/scoring-config';
import { EntityAccessPredicateProvider } from './access-predicate';
import type {
  AccessPredicateProvider,
  IndexableSource,
  PageCursor,
  SearchablePage,
} from './indexable-source.port';

const DATA_MART_JOIN_ALIAS = 'dm';

@Injectable()
export class DataMartIndexableSource implements IndexableSource {
  readonly entityType = SearchableEntityType.DATA_MART;
  readonly scoringConfig: ScoringConfig = DATA_MART_SCORING_CONFIG;
  readonly accessPredicateProvider: AccessPredicateProvider;

  constructor(
    @Inject(DATA_MART_CATALOG) private readonly catalog: DataMartCatalogPort,
    @InjectRepository(DataMart) dataMartRepo: Repository<DataMart>,
    contextAccessService: ContextAccessService
  ) {
    this.accessPredicateProvider = new EntityAccessPredicateProvider({
      repo: dataMartRepo,
      joinAlias: DATA_MART_JOIN_ALIAS,
      joinSql: indexAlias =>
        `JOIN data_mart ${DATA_MART_JOIN_ALIAS} ON ${DATA_MART_JOIN_ALIAS}.id = ${indexAlias}.entity_id`,
      extraClauses: [`${DATA_MART_JOIN_ALIAS}.deletedAt IS NULL`],
      extraParameters: {},
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
    return this.catalog.listSearchablePage(projectId, cursor, limit);
  }

  async listProjectIds(): Promise<string[]> {
    return this.catalog.listProjectIds();
  }

  async loadSearchableOne(entityId: string): Promise<EntityScoringDescriptor | null> {
    const mart = await this.catalog.loadSearchable(entityId);
    if (!mart) return null;

    const edges = await this.catalog.listOutboundEdges(mart.id);
    const targets = await Promise.all(
      edges.map(edge => this.catalog.loadSearchable(edge.targetDataMartId))
    );

    const martsById = new Map<string, SearchableDataMart>([[mart.id, mart]]);
    for (const target of targets) {
      if (target) martsById.set(target.id, target);
    }
    const outboundEdgesBySourceId = new Map<string, RelationshipEdge[]>([[mart.id, edges]]);

    return buildDataMartScoringDescriptor(
      mart,
      outboundEdgesBySourceId,
      martsById,
      this.scoringConfig
    );
  }
}
