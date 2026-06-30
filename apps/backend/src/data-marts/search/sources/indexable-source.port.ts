import { FindOptionsWhere, MoreThan, Raw } from 'typeorm';
import { SearchableEntityType } from '../../../common/search/search.facade';
import type { EntityScoringDescriptor } from '../indexing/entity-scoring-descriptor';
import type { ScoringConfig } from '../engine/scoring-config';

export const INDEXABLE_SOURCES = Symbol('INDEXABLE_SOURCES');

export interface SourceAccessScope {
  userId: string;
  roles: string[];
}

export interface AccessPredicate {
  joinSql: string;
  whereSql: string;
  parameters: Record<string, unknown>;
}

export interface AccessPredicateProvider {
  build(
    indexAlias: string,
    projectId: string,
    accessScope?: SourceAccessScope
  ): Promise<AccessPredicate>;
}

export interface PageCursor {
  createdAt: string;
  id: string;
}

export function toCursorTimestamp(createdAt: Date): string {
  const timestamp = createdAt.toISOString().replace('T', ' ').replace('Z', '');
  return timestamp.endsWith('.000') ? timestamp.slice(0, 19) : timestamp;
}

type KeysetRow = { createdAt: Date; id: string };
type CreatedAtSortDirection = 'ASC' | 'DESC';

export function buildKeysetWhere<T extends KeysetRow>(
  baseWhere: FindOptionsWhere<T>,
  cursor: PageCursor | null,
  createdAtDirection: CreatedAtSortDirection = 'ASC'
): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
  if (!cursor) return baseWhere;
  const createdAtComparison = createdAtDirection === 'DESC' ? '<' : '>';

  return [
    {
      ...baseWhere,
      createdAt: Raw(alias => `${alias} ${createdAtComparison} :cBoundary`, {
        cBoundary: cursor.createdAt,
      }),
    },
    {
      ...baseWhere,
      createdAt: Raw(alias => `${alias} = :cAt`, { cAt: cursor.createdAt }),
      id: MoreThan(cursor.id),
    },
  ];
}

export function nextPageCursor<T extends KeysetRow>(rows: T[], limit: number): PageCursor | null {
  const last = rows[rows.length - 1];
  if (rows.length < limit || !last) return null;
  return { createdAt: toCursorTimestamp(last.createdAt), id: last.id };
}

export interface SearchablePage {
  descriptors: EntityScoringDescriptor[];
  nextCursor: PageCursor | null;
}

export interface IndexableSource {
  readonly entityType: SearchableEntityType;
  readonly scoringConfig: ScoringConfig;
  readonly accessPredicateProvider: AccessPredicateProvider;
  listSearchablePage(
    projectId: string,
    cursor: PageCursor | null,
    limit: number
  ): Promise<SearchablePage>;
  listProjectIds(): Promise<string[]>;
  loadSearchableOne(entityId: string): Promise<EntityScoringDescriptor | null>;
}
