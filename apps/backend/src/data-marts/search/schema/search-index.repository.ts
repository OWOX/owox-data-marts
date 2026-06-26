import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityTarget, In, Repository } from 'typeorm';
import { SearchableEntityType } from '../../../common/search/search.facade';
import type { AccessPredicate } from '../sources/indexable-source.port';
import { buildDbSearchQuery, buildSearchText } from '../engine/search-query-builder';
import { vecToBuffer } from '../embedding/vector-codec';
import { DataMartSearchIndex } from '../../entities/search/data-mart-search-index.entity';
import { DataStorageSearchIndex } from '../../entities/search/data-storage-search-index.entity';
import { DataDestinationSearchIndex } from '../../entities/search/data-destination-search-index.entity';

export type EmbeddingStatus = 'READY' | 'MISSING';

export interface SearchIndexRow {
  entityId: string;
  projectId: string;
  isDraft: boolean;
  embedding: Buffer | null;
  document: string | null;
  fieldCount: number | null;
  docHash: string;
  updatedAt: Date;
}

export type StreamedIndexRow = SearchIndexRow;

export interface StreamPage {
  rows: StreamedIndexRow[];
  nextCursor: string | null;
}

export interface SearchCandidatesOptions {
  candidateLimit: number;
  vectorCandidateLimit?: number;
  excludeDrafts?: boolean;
  promptVec?: Float32Array | null;
}

export interface SearchIndexState {
  projectId: string;
  docHash: string;
  embeddingStatus: EmbeddingStatus;
}

interface SearchIndexEntity {
  entityId: string;
  projectId: string;
  isDraft?: boolean;
  embedding: Buffer | null;
  embeddingStatus: string;
  document: string | null;
  searchText: string | null;
  fieldCount?: number | null;
  docHash: string;
  updatedAt: Date;
}

type RawRow = {
  entity_id: string;
  project_id: string;
  is_draft: number;
  embedding: Buffer | null;
  embedding_status?: string | null;
  document: string | null;
  field_count: number | null;
  doc_hash: string;
  updated_at: string | Date;
};

type CandidateStrategy = 'vector' | 'fulltext' | 'like';
const VECTOR_QUERY_ERROR_COOLDOWN_MS = 60_000;

interface CandidateSearchLogContext {
  mode: CandidateStrategy;
  entityType: SearchableEntityType;
  table: string;
  projectId: string;
  tokenCount: number;
  candidateLimit: number;
  excludeDrafts: boolean;
}

const ENTITY_CLASS_BY_TYPE: Record<SearchableEntityType, EntityTarget<SearchIndexEntity>> = {
  [SearchableEntityType.DATA_MART]: DataMartSearchIndex,
  [SearchableEntityType.DATA_STORAGE]: DataStorageSearchIndex,
  [SearchableEntityType.DATA_DESTINATION]: DataDestinationSearchIndex,
};

const TABLE_BY_ENTITY_TYPE: Record<SearchableEntityType, string> = {
  [SearchableEntityType.DATA_MART]: 'data_mart_search_index',
  [SearchableEntityType.DATA_STORAGE]: 'data_storage_search_index',
  [SearchableEntityType.DATA_DESTINATION]: 'data_destination_search_index',
};

const ENTITY_TABLE_BY_TYPE: Record<SearchableEntityType, string> = {
  [SearchableEntityType.DATA_MART]: 'data_mart',
  [SearchableEntityType.DATA_STORAGE]: 'data_storage',
  [SearchableEntityType.DATA_DESTINATION]: 'data_destination',
};

const TYPE_HAS_DRAFT_AND_FIELD_COUNT: Record<SearchableEntityType, boolean> = {
  [SearchableEntityType.DATA_MART]: true,
  [SearchableEntityType.DATA_STORAGE]: false,
  [SearchableEntityType.DATA_DESTINATION]: false,
};

const MAX_IN_PARAMS = 500;

function searchTextFullTextIndexName(tableName: string): string {
  return `ftx_${tableName}_search_text`;
}

export function resolveSearchIndexTable(entityType: SearchableEntityType): string {
  const table = TABLE_BY_ENTITY_TYPE[entityType];
  if (!table) {
    throw new Error(`Unknown entity type: ${entityType}`);
  }
  return table;
}

function parseDate(v: string | Date): Date {
  if (v instanceof Date) return v;
  const normalized = v.includes('T') || v.endsWith('Z') ? v : v.replace(' ', 'T') + 'Z';
  return new Date(normalized);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

@Injectable()
export class SearchIndexRepository {
  private readonly logger = new Logger(SearchIndexRepository.name);
  private readonly fullTextAvailableByTable = new Map<string, boolean>();
  private vectorAvailable: boolean | undefined;
  private vectorUnavailableUntil = 0;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private repoFor(entityType: SearchableEntityType): Repository<SearchIndexEntity> {
    return this.dataSource.getRepository(ENTITY_CLASS_BY_TYPE[entityType]);
  }

  private toEntityRow(entityType: SearchableEntityType, row: SearchIndexRow): SearchIndexEntity {
    const entityRow: SearchIndexEntity = {
      entityId: row.entityId,
      projectId: row.projectId,
      embedding: row.embedding,
      embeddingStatus: row.embedding ? 'READY' : 'MISSING',
      document: row.document,
      searchText: buildSearchText(row.document),
      docHash: row.docHash,
      updatedAt: row.updatedAt,
    };

    if (TYPE_HAS_DRAFT_AND_FIELD_COUNT[entityType]) {
      entityRow.isDraft = row.isDraft;
      entityRow.fieldCount = row.fieldCount;
    }

    return entityRow;
  }

  async upsert(entityType: SearchableEntityType, row: SearchIndexRow): Promise<void> {
    await this.repoFor(entityType).upsert(this.toEntityRow(entityType, row), ['entityId']);
  }

  async upsertMany(entityType: SearchableEntityType, rows: SearchIndexRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.repoFor(entityType).upsert(
      rows.map(row => this.toEntityRow(entityType, row)),
      ['entityId']
    );
  }

  async listIndexStateByIds(
    entityType: SearchableEntityType,
    ids: string[]
  ): Promise<Map<string, SearchIndexState>> {
    const map = new Map<string, SearchIndexState>();
    if (ids.length === 0) return map;
    const repo = this.repoFor(entityType);

    for (const idChunk of chunk(ids, MAX_IN_PARAMS)) {
      const rows = await repo.find({
        where: { entityId: In(idChunk) },
        select: { entityId: true, projectId: true, docHash: true, embeddingStatus: true },
      });
      for (const r of rows) {
        map.set(r.entityId, {
          projectId: r.projectId,
          docHash: r.docHash,
          embeddingStatus: r.embeddingStatus === 'READY' ? 'READY' : 'MISSING',
        });
      }
    }
    return map;
  }

  async deleteOrphans(entityType: SearchableEntityType, projectId?: string): Promise<number> {
    const indexTable = resolveSearchIndexTable(entityType);
    const entityTable = ENTITY_TABLE_BY_TYPE[entityType];
    const qb = this.repoFor(entityType)
      .createQueryBuilder()
      .delete()
      .where(
        `NOT EXISTS (
           SELECT 1 FROM ${entityTable} e
           WHERE e.id = ${indexTable}.entity_id
             AND e.projectId = ${indexTable}.project_id
             AND e.deletedAt IS NULL
         )`
      );

    if (projectId) {
      qb.andWhere(`${indexTable}.project_id = :projectId`, { projectId });
    }

    const result = await qb.execute();
    return result.affected ?? 0;
  }

  async deleteByEntityId(entityType: SearchableEntityType, entityId: string): Promise<number> {
    const result = await this.repoFor(entityType).delete({ entityId });
    return result.affected ?? 0;
  }

  async deleteByEntityIdAndProjectId(
    entityType: SearchableEntityType,
    entityId: string,
    projectId: string
  ): Promise<number> {
    const result = await this.repoFor(entityType).delete({ entityId, projectId });
    return result.affected ?? 0;
  }

  async deleteByEntityIds(entityType: SearchableEntityType, entityIds: string[]): Promise<number> {
    if (entityIds.length === 0) return 0;
    const repo = this.repoFor(entityType);
    let deleted = 0;
    for (const idChunk of chunk(entityIds, MAX_IN_PARAMS)) {
      const result = await repo.delete({ entityId: In(idChunk) });
      deleted += result.affected ?? 0;
    }
    return deleted;
  }

  async searchCandidates(
    entityType: SearchableEntityType,
    projectId: string,
    accessPredicate: AccessPredicate,
    prompt: string,
    options: SearchCandidatesOptions
  ): Promise<StreamPage> {
    const table = resolveSearchIndexTable(entityType);
    const selectColumns = this.searchCandidateSelectColumns(entityType, 'idx');
    const draftFilter = this.searchCandidateDraftFilter(entityType, options);
    const query = buildDbSearchQuery(prompt);
    const candidateLimit = options.candidateLimit;
    const vectorLimit = options.vectorCandidateLimit ?? candidateLimit;
    const baseLogContext = {
      entityType,
      table,
      projectId,
      tokenCount: query.tokens.length,
      candidateLimit,
      excludeDrafts: draftFilter.length > 0,
    };

    if (options.promptVec && (await this.supportsVector())) {
      try {
        const vectorPage = await this.executeSearchCandidatesQuery(
          `
            SELECT ${selectColumns},
                   COSINE_DISTANCE(idx.embedding, :promptVec) AS vector_distance
            FROM ${table} idx
            ${accessPredicate.joinSql}
            WHERE idx.project_id = :projectId
              ${accessPredicate.whereSql ? `AND ${accessPredicate.whereSql}` : ''}
              ${draftFilter}
              AND idx.embedding IS NOT NULL
            ORDER BY vector_distance ASC,
                     idx.entity_id ASC
            LIMIT :vectorLimit
          `,
          {
            projectId,
            vectorLimit,
            // Cloud SQL vector search accepts the same Float32 BLOB payload that we persist.
            promptVec: vecToBuffer(options.promptVec),
            ...accessPredicate.parameters,
          },
          { ...baseLogContext, candidateLimit: vectorLimit, mode: 'vector' }
        );

        if (query.tokens.length === 0) return vectorPage;

        const missingEmbeddingKeywordPage = await this.executeFallbackCandidateQuery(
          table,
          entityType,
          projectId,
          accessPredicate,
          query.tokens,
          options,
          {
            ...baseLogContext,
            mode: 'like',
          },
          "AND idx.embedding_status = 'MISSING'"
        );

        return this.mergeCandidatePages(vectorPage, missingEmbeddingKeywordPage);
      } catch (err) {
        this.markVectorUnavailable('native vector query failed; using keyword fallback', err);
      }
    }

    if (query.tokens.length > 0 && (await this.supportsFullText(table))) {
      try {
        return await this.executeSearchCandidatesQuery(
          `
            SELECT ${selectColumns}
            FROM ${table} idx
            ${accessPredicate.joinSql}
            WHERE idx.project_id = :projectId
              ${accessPredicate.whereSql ? `AND ${accessPredicate.whereSql}` : ''}
              ${draftFilter}
              AND MATCH(idx.search_text) AGAINST (:booleanQuery IN BOOLEAN MODE) > 0
            ORDER BY MATCH(idx.search_text) AGAINST (:booleanQuery IN BOOLEAN MODE) DESC,
                     idx.entity_id ASC
            LIMIT :candidateLimit
          `,
          {
            projectId,
            candidateLimit,
            booleanQuery: query.mysqlBooleanQuery,
            ...accessPredicate.parameters,
          },
          { ...baseLogContext, mode: 'fulltext' }
        );
      } catch (err) {
        this.markFullTextUnavailable(
          table,
          `full-text query failed for ${searchTextFullTextIndexName(table)}; using keyword fallback`,
          err
        );
      }
    }

    return this.executeFallbackCandidateQuery(
      table,
      entityType,
      projectId,
      accessPredicate,
      query.tokens,
      options,
      {
        ...baseLogContext,
        mode: 'like',
      }
    );
  }

  private toStreamedRow(r: RawRow): StreamedIndexRow {
    return {
      entityId: r.entity_id,
      projectId: r.project_id,
      isDraft: r.is_draft !== 0,
      embedding: r.embedding,
      document: r.document,
      fieldCount: r.field_count,
      docHash: r.doc_hash,
      updatedAt: parseDate(r.updated_at),
    };
  }

  private async executeSearchCandidatesQuery(
    rawSql: string,
    namedParams: Record<string, unknown>,
    logContext: CandidateSearchLogContext
  ): Promise<StreamPage> {
    const { sql, params } = this.namedToPositional(rawSql, namedParams);
    this.logCandidateSearchQuery(logContext, sql, params.length);

    const raw: RawRow[] = await this.dataSource.query(sql, params);
    this.logger.log(
      this.formatLogLine('advanced-search database candidate query result', {
        mode: logContext.mode,
        entityType: logContext.entityType,
        table: logContext.table,
        projectId: logContext.projectId,
        resultCount: raw.length,
      })
    );

    return {
      rows: raw.map(r => this.toStreamedRow(r)),
      nextCursor: null,
    };
  }

  private async executeFallbackCandidateQuery(
    table: string,
    entityType: SearchableEntityType,
    projectId: string,
    predicate: AccessPredicate,
    tokens: string[],
    options: SearchCandidatesOptions,
    logContext: CandidateSearchLogContext,
    additionalWhereSql = ''
  ): Promise<StreamPage> {
    const namedParams: Record<string, unknown> = {
      projectId,
      candidateLimit: options.candidateLimit,
      ...predicate.parameters,
    };
    const filters: string[] = [];
    const selectColumns = this.searchCandidateSelectColumns(entityType, 'idx');
    const draftFilter = this.searchCandidateDraftFilter(entityType, options);

    tokens.forEach((token, index) => {
      const paramName = `likeToken${index}`;
      namedParams[paramName] = `%${this.escapeLikePattern(token)}%`;
      filters.push(`idx.search_text LIKE :${paramName} ESCAPE '!'`);
    });

    const rawSql = `
      SELECT ${selectColumns}
      FROM ${table} idx
      ${predicate.joinSql}
      WHERE idx.project_id = :projectId
        ${predicate.whereSql ? `AND ${predicate.whereSql}` : ''}
        ${draftFilter}
        ${additionalWhereSql}
        ${filters.length > 0 ? `AND ${filters.join(' AND ')}` : ''}
      ORDER BY idx.updated_at DESC, idx.entity_id ASC
      LIMIT :candidateLimit
    `;

    return this.executeSearchCandidatesQuery(rawSql, namedParams, logContext);
  }

  private mergeCandidatePages(primary: StreamPage, supplemental: StreamPage): StreamPage {
    const seen = new Set<string>();
    const rows: StreamedIndexRow[] = [];
    for (const row of [...primary.rows, ...supplemental.rows]) {
      if (seen.has(row.entityId)) continue;
      seen.add(row.entityId);
      rows.push(row);
    }

    return {
      rows,
      nextCursor: null,
    };
  }

  private searchCandidateSelectColumns(entityType: SearchableEntityType, alias: string): string {
    const isDraftSelect = TYPE_HAS_DRAFT_AND_FIELD_COUNT[entityType]
      ? `${alias}.is_draft`
      : '0 AS is_draft';
    const fieldCountSelect = TYPE_HAS_DRAFT_AND_FIELD_COUNT[entityType]
      ? `${alias}.field_count`
      : '0 AS field_count';

    return `${alias}.entity_id, ${alias}.project_id, ${isDraftSelect}, ${alias}.embedding, ${alias}.document,
            ${fieldCountSelect}, ${alias}.doc_hash, ${alias}.updated_at`;
  }

  private searchCandidateDraftFilter(
    entityType: SearchableEntityType,
    options: SearchCandidatesOptions
  ): string {
    return options.excludeDrafts && TYPE_HAS_DRAFT_AND_FIELD_COUNT[entityType]
      ? 'AND idx.is_draft = 0'
      : '';
  }

  private logCandidateSearchQuery(
    context: CandidateSearchLogContext,
    sql: string,
    parameterCount: number
  ): void {
    this.logger.log(this.formatLogLine('advanced-search database candidate search mode', context));
    this.logger.log(
      this.formatLogLine('advanced-search database candidate SQL query', {
        mode: context.mode,
        entityType: context.entityType,
        table: context.table,
        projectId: context.projectId,
        sql: this.compactSql(sql),
        parameterCount,
      })
    );
  }

  private compactSql(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim();
  }

  private namedToPositional(
    sql: string,
    namedParams: Record<string, unknown>
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const converted = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name: string) => {
      if (!(name in namedParams)) {
        throw new Error(`Missing parameter: ${name}`);
      }
      params.push(namedParams[name]);
      return '?';
    });
    return { sql: converted, params };
  }

  private formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private async supportsVector(): Promise<boolean> {
    if (this.vectorAvailable === false) {
      if (this.vectorUnavailableUntil > 0) {
        if (Date.now() < this.vectorUnavailableUntil) {
          return false;
        }
        this.vectorAvailable = undefined;
        this.vectorUnavailableUntil = 0;
      } else {
        return false;
      }
    }

    if (this.vectorAvailable === true) {
      return true;
    }

    try {
      const rows: Array<{ Value?: string; value?: string }> = await this.dataSource.query(
        `SHOW VARIABLES LIKE 'cloudsql_vector'`
      );
      const value = rows[0]?.Value ?? rows[0]?.value;
      this.vectorAvailable = String(value ?? '').toUpperCase() === 'ON';
    } catch {
      this.vectorAvailable = false;
    }
    return this.vectorAvailable;
  }

  private async supportsFullText(tableName: string): Promise<boolean> {
    const cached = this.fullTextAvailableByTable.get(tableName);
    if (cached !== undefined) return cached;

    const indexName = searchTextFullTextIndexName(tableName);
    try {
      const rows: { INDEX_NAME: string }[] = await this.dataSource.query(
        `SELECT INDEX_NAME
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND INDEX_NAME = ?
           AND INDEX_TYPE = 'FULLTEXT'`,
        [tableName, indexName]
      );
      const exists = rows.length > 0;
      this.fullTextAvailableByTable.set(tableName, exists);
      return exists;
    } catch {
      this.fullTextAvailableByTable.set(tableName, false);
      return false;
    }
  }

  private markFullTextUnavailable(tableName: string, message: string, err: unknown): void {
    this.fullTextAvailableByTable.set(tableName, false);
    this.logger.warn(`${message}: ${this.formatError(err)}`);
  }

  private markVectorUnavailable(message: string, err: unknown): void {
    this.vectorAvailable = false;
    this.vectorUnavailableUntil = Date.now() + VECTOR_QUERY_ERROR_COOLDOWN_MS;
    this.logger.warn(`${message}: ${this.formatError(err)}`);
  }

  private escapeLikePattern(value: string): string {
    return value.replace(/[!%_]/g, match => `!${match}`);
  }

  private formatLogLine(message: string, fields: object): string {
    const context = Object.entries(fields)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ');

    return `${message} ${context}`;
  }
}
