import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { DataStorage } from '../../entities/data-storage.entity';
import {
  DataStorageType,
  toHumanReadable,
} from '../../data-storage-types/enums/data-storage-type.enum';
import { ContextAccessService } from '../../services/context/context-access.service';
import { applyDataStorageVisibilityFilter } from '../../utils/apply-data-storage-visibility-filter';
import type {
  AtomicTokenSlot,
  EntityScoringDescriptor,
  RichTextSlot,
} from '../indexing/entity-scoring-descriptor';
import { DATA_MART_SCORING_CONFIG, type ScoringConfig } from '../engine/scoring-config';
import { EntityAccessPredicateProvider } from './access-predicate';
import type {
  AccessPredicateProvider,
  IndexableSource,
  PageCursor,
  SearchablePage,
} from './indexable-source.port';
import { buildKeysetWhere, nextPageCursor } from './indexable-source.port';

const STORAGE_JOIN_ALIAS = 'ds';

const GOOGLE_STORAGE_TYPES = new Set<DataStorageType>([
  DataStorageType.GOOGLE_BIGQUERY,
  DataStorageType.LEGACY_GOOGLE_BIGQUERY,
]);

function extractEmail(storage: DataStorage): string | null {
  if (!GOOGLE_STORAGE_TYPES.has(storage.type)) return null;
  return storage.credential?.identity?.clientEmail ?? storage.credential?.identity?.email ?? null;
}

function toDescriptor(storage: DataStorage): EntityScoringDescriptor {
  const title = storage.title ?? '';
  const typeLabel = toHumanReadable(storage.type);

  const richTextSlots: RichTextSlot[] = [
    { kind: 'title', text: title },
    { kind: 'context', text: typeLabel },
  ];

  const email = extractEmail(storage);
  const atomicTokenSlots: AtomicTokenSlot[] = email ? [{ kind: 'field', text: email }] : [];
  const emails = email ? [email] : [];

  const embeddingText = [title, typeLabel, ...emails].filter(Boolean).join('\n');

  return {
    entityType: SearchableEntityType.DATA_STORAGE,
    entityId: storage.id,
    projectId: storage.projectId,
    title,
    description: null,
    richTextSlots,
    atomicTokenSlots,
    fieldCount: 0,
    extendability: 0,
    modifiedAt: storage.modifiedAt,
    embeddingText,
    isDraft: false,
  };
}

@Injectable()
export class DataStorageIndexableSource implements IndexableSource {
  readonly entityType = SearchableEntityType.DATA_STORAGE;
  readonly scoringConfig: ScoringConfig = DATA_MART_SCORING_CONFIG;
  readonly accessPredicateProvider: AccessPredicateProvider;

  constructor(
    @InjectRepository(DataStorage) private readonly dataStorageRepo: Repository<DataStorage>,
    private readonly contextAccessService: ContextAccessService
  ) {
    this.accessPredicateProvider = new EntityAccessPredicateProvider({
      repo: dataStorageRepo,
      joinAlias: STORAGE_JOIN_ALIAS,
      joinSql: indexAlias =>
        `JOIN data_storage ${STORAGE_JOIN_ALIAS} ON ${STORAGE_JOIN_ALIAS}.id = ${indexAlias}.entity_id AND ${STORAGE_JOIN_ALIAS}.projectId = ${indexAlias}.project_id`,
      extraClauses: [`${STORAGE_JOIN_ALIAS}.deletedAt IS NULL`],
      applyFilter: (qb, { projectId, userId, roles, roleScope }) =>
        applyDataStorageVisibilityFilter(qb, {
          storageAlias: STORAGE_JOIN_ALIAS,
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
    const where = buildKeysetWhere<DataStorage>({ projectId, deletedAt: IsNull() }, cursor);

    const storages = await this.dataStorageRepo.find({
      where,
      relations: { credential: true },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: limit,
    });
    const descriptors = storages.map(toDescriptor);

    return { descriptors, nextCursor: nextPageCursor(storages, limit) };
  }

  async listProjectIds(): Promise<string[]> {
    const rows: { projectId: string }[] = await this.dataStorageRepo
      .createQueryBuilder(STORAGE_JOIN_ALIAS)
      .select(`DISTINCT ${STORAGE_JOIN_ALIAS}.projectId`, 'projectId')
      .where(`${STORAGE_JOIN_ALIAS}.deletedAt IS NULL`)
      .getRawMany();
    return rows.map(r => r.projectId);
  }

  async loadSearchableOne(entityId: string): Promise<EntityScoringDescriptor | null> {
    const storage = await this.dataStorageRepo
      .createQueryBuilder(STORAGE_JOIN_ALIAS)
      .leftJoinAndSelect(`${STORAGE_JOIN_ALIAS}.credential`, 'sCred')
      .where(`${STORAGE_JOIN_ALIAS}.id = :id`, { id: entityId })
      .andWhere(`${STORAGE_JOIN_ALIAS}.deletedAt IS NULL`)
      .getOne();
    if (!storage) return null;
    return toDescriptor(storage);
  }
}
