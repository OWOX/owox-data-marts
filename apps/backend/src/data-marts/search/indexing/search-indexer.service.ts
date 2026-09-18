import { Inject, Injectable, Logger } from '@nestjs/common';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../embedding/embedding-provider';
import { SearchIndexRepository } from '../schema/search-index.repository';
import type { SearchIndexRow } from '../schema/search-index.repository';
import { IndexableSourceRegistry } from '../sources/indexable-source.registry';
import type { PageCursor } from '../sources/indexable-source.port';
import { buildDocument, embeddingText, docHash, indexSignature } from './document-builder';
import { vecToBuffer } from '../embedding/vector-codec';
import type { EntityScoringDescriptor } from './entity-scoring-descriptor';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { ReportIndexableSource, type ReportSearchParent } from '../sources/report.source';

export interface TypeProjectSyncStats {
  indexed: number;
  skipped: number;
  embedFailed: number;
  errors: number;
  deletedOrphans: number;
}

@Injectable()
export class SearchIndexerService {
  private readonly logger = new Logger(SearchIndexerService.name);

  constructor(
    private readonly registry: IndexableSourceRegistry,
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    private readonly repository: SearchIndexRepository,
    @Inject(ADVANCED_SEARCH_CONFIG) private readonly config: AdvancedSearchConfig,
    private readonly reportSource: ReportIndexableSource
  ) {}

  async reindexEntity(
    entityType: SearchableEntityType,
    entityId: string,
    projectId?: string
  ): Promise<void> {
    if (entityType === SearchableEntityType.REPORT) {
      const reportProjectId =
        projectId ?? (await this.reportSource.loadSearchableOne(entityId))?.projectId;
      if (!reportProjectId) {
        await this.repository.deleteByEntityId(entityType, entityId);
        return;
      }
      await this.indexReports([entityId], reportProjectId);
      return;
    }
    const source = this.registry.resolve(entityType);
    if (!source) {
      this.logger.debug(`reindexEntity: ${entityType} source not registered, skipping`);
      return;
    }

    const descriptor = await source.loadSearchableOne(entityId);
    if (!descriptor) {
      await this.repository.deleteByEntityId(entityType, entityId);
      return;
    }
    if (projectId && descriptor.projectId !== projectId) {
      this.logger.debug(`reindexEntity: ${entityType} ${entityId} project mismatch, skipping`);
      await this.repository.deleteByEntityIdAndProjectId(entityType, entityId, projectId);
      return;
    }

    const document = buildDocument(descriptor);
    const hash = docHash(this.provider.modelId, indexSignature(descriptor, document));
    const state = (
      await this.repository.listIndexStateByIds(source.entityType, [descriptor.entityId])
    ).get(descriptor.entityId);
    if (
      state?.projectId === descriptor.projectId &&
      state.docHash === hash &&
      state.embeddingStatus === 'READY'
    ) {
      return;
    }

    await this.upsertDescriptor(source.entityType, descriptor, document, hash);
  }

  async deleteEntity(entityType: SearchableEntityType, entityId: string): Promise<void> {
    await this.repository.deleteByEntityId(entityType, entityId);
  }

  async syncTypeProject(
    entityType: SearchableEntityType,
    projectId: string,
    signal?: AbortSignal
  ): Promise<TypeProjectSyncStats> {
    const stats: TypeProjectSyncStats = {
      indexed: 0,
      skipped: 0,
      embedFailed: 0,
      errors: 0,
      deletedOrphans: 0,
    };

    const source = this.registry.resolve(entityType);
    if (!source) {
      this.logger.debug(`syncTypeProject: ${entityType} source not registered, skipping`);
      return stats;
    }

    let cursor: PageCursor | null = null;
    const seenCursors = new Set<string>();
    const limit = this.config.indexBatchSize;

    do {
      if (signal?.aborted) break;

      const page = await source.listSearchablePage(projectId, cursor, limit);
      if (page.nextCursor) {
        const cursorKey = JSON.stringify(page.nextCursor);
        if (seenCursors.has(cursorKey)) {
          throw new Error(
            `syncTypeProject: ${entityType} project ${projectId} returned a repeated cursor`
          );
        }
        seenCursors.add(cursorKey);
      }
      cursor = page.nextCursor;

      if (page.descriptors.length === 0) continue;

      if (entityType === SearchableEntityType.REPORT) {
        try {
          const result = await this.indexReports(
            page.descriptors.map(d => d.entityId),
            projectId
          );
          stats.indexed += result.indexed;
          stats.skipped += result.skipped;
        } catch (err) {
          stats.errors += page.descriptors.length;
          this.logger.error(`syncTypeProject: report batch error for project ${projectId}`, err);
        }
        continue;
      }

      const pageIds = page.descriptors.map(d => d.entityId);
      const existingState = await this.repository.listIndexStateByIds(entityType, pageIds);

      const prepared = page.descriptors.map(descriptor => {
        const document = buildDocument(descriptor);
        return {
          descriptor,
          document,
          hash: docHash(this.provider.modelId, indexSignature(descriptor, document)),
        };
      });

      const stale = prepared
        .map(item => ({
          ...item,
          initialState: existingState.get(item.descriptor.entityId),
        }))
        .filter(({ descriptor, hash, initialState }) => {
          return (
            !initialState ||
            initialState.projectId !== descriptor.projectId ||
            initialState.docHash !== hash ||
            initialState.embeddingStatus !== 'READY'
          );
        });

      stats.skipped += prepared.length - stale.length;

      if (stale.length === 0) continue;

      try {
        const embTexts = stale.map(({ descriptor }) => embeddingText(descriptor));
        const vecs = await this.provider.embed(embTexts, { inputType: 'search_document' });
        const now = new Date();
        const rows: SearchIndexRow[] = [];

        stale.forEach(({ descriptor, document, hash }, j) => {
          const vec = vecs[j] ?? null;
          if (vec === null) {
            stats.embedFailed++;
            return;
          }

          rows.push({
            entityId: descriptor.entityId,
            projectId: descriptor.projectId,
            isDraft: descriptor.isDraft,
            embedding: vecToBuffer(vec),
            document,
            fieldCount: descriptor.fieldCount,
            docHash: hash,
            updatedAt: now,
          });
        });

        if (rows.length > 0) {
          const currentState = await this.repository.listIndexStateByIds(
            entityType,
            rows.map(row => row.entityId)
          );
          const rowsStillCurrent = rows.filter(row => {
            const staleItem = stale.find(item => item.descriptor.entityId === row.entityId);
            return this.indexStateMatches(staleItem?.initialState, currentState.get(row.entityId));
          });

          if (rowsStillCurrent.length > 0) {
            await this.repository.upsertMany(entityType, rowsStillCurrent);
          }
          stats.indexed += rowsStillCurrent.length;
        }
      } catch (err) {
        stats.errors += stale.length;
        this.logger.error(
          `syncTypeProject: batch error for ${entityType} project ${projectId}`,
          err
        );
      }
    } while (cursor !== null);

    if (!signal?.aborted) {
      stats.deletedOrphans += await this.repository.deleteOrphans(entityType, projectId);
    }

    this.logger.log(
      `syncTypeProject ${entityType} project=${projectId} — indexed: ${stats.indexed}, skipped: ${stats.skipped}, embedFailed: ${stats.embedFailed}, deletedOrphans: ${stats.deletedOrphans}, errors: ${stats.errors}`
    );

    return stats;
  }

  async reindexReportsPage(
    parent: ReportSearchParent,
    projectId: string,
    cursor: PageCursor | null,
    signal?: AbortSignal
  ): Promise<{ nextCursor: PageCursor | null; errors: number }> {
    if (signal?.aborted) throw new Error('Report reindex cancelled');
    const page = await this.reportSource.listSearchablePage(
      projectId,
      cursor,
      this.config.indexBatchSize,
      parent
    );
    if (
      cursor &&
      page.nextCursor &&
      (page.nextCursor.createdAt < cursor.createdAt ||
        (page.nextCursor.createdAt === cursor.createdAt && page.nextCursor.id <= cursor.id))
    ) {
      throw new Error('Report reindex cursor did not advance');
    }
    let errors = 0;
    try {
      await this.indexReports(
        page.descriptors.map(d => d.entityId),
        projectId
      );
    } catch (err) {
      errors = page.descriptors.length;
      this.logger.error(`Report parent reindex batch failed for ${parent.entityId}`, err);
    }
    if (signal?.aborted) throw new Error('Report reindex cancelled');
    return { nextCursor: page.nextCursor, errors };
  }

  private async indexReports(
    ids: string[],
    projectId: string,
    attempt = 0
  ): Promise<{ indexed: number; skipped: number }> {
    if (ids.length === 0) return { indexed: 0, skipped: 0 };
    const entityType = SearchableEntityType.REPORT;
    // Read index state BEFORE refreshing source data, otherwise an old descriptor
    // could overwrite a newer index row using that newer row as its expected state.
    const expected = await this.repository.listIndexStateByIds(entityType, ids);
    const descriptors = await this.reportSource.loadSearchableByIds(projectId, ids);
    const found = new Set(descriptors.map(d => d.entityId));
    const removedIds = ids.filter(id => !found.has(id));
    for (const id of removedIds) {
      await this.repository.deleteByEntityIdAndProjectId(entityType, id, projectId);
    }
    const stale = descriptors
      .map(descriptor => {
        const document = buildDocument(descriptor);
        return {
          descriptor,
          document,
          hash: docHash(this.provider.modelId, indexSignature(descriptor, document)),
        };
      })
      .filter(({ descriptor, hash }) => {
        const state = expected.get(descriptor.entityId);
        return (
          state?.projectId !== projectId ||
          state.docHash !== hash ||
          state.embeddingStatus !== 'READY'
        );
      });
    const skipped = descriptors.length - stale.length;
    if (stale.length === 0 && removedIds.length === 0) return { indexed: 0, skipped };
    const vectors =
      stale.length > 0
        ? await this.provider.embed(
            stale.map(({ descriptor }) => embeddingText(descriptor)),
            {
              inputType: 'search_document',
            }
          )
        : [];
    const rows: SearchIndexRow[] = [];
    stale.forEach(({ descriptor, document, hash }, i) => {
      const vector = vectors[i];
      if (!vector) return;
      rows.push({
        entityId: descriptor.entityId,
        projectId,
        isDraft: false,
        document,
        docHash: hash,
        embedding: vecToBuffer(vector),
        fieldCount: 0,
        updatedAt: new Date(),
      });
    });
    const conflicts = new Set(await this.repository.upsertReportsIfUnchanged(rows, expected));
    // Verify AFTER writing: a rename back to the original title can make the latest
    // worker skip an unchanged index while an older embedding is still in flight.
    // Include deletions so a recreated report is not erased by an older missing read.
    const writtenHashes = new Map(rows.map(row => [row.entityId, row.docHash]));
    const verifiedIds = [...writtenHashes.keys(), ...removedIds];
    const currentDescriptors = await this.reportSource.loadSearchableByIds(projectId, verifiedIds);
    const currentHashes = new Map(
      currentDescriptors.map(descriptor => [
        descriptor.entityId,
        docHash(this.provider.modelId, indexSignature(descriptor, buildDocument(descriptor))),
      ])
    );
    for (const id of verifiedIds) {
      if (currentHashes.get(id) !== writtenHashes.get(id)) conflicts.add(id);
    }
    if (conflicts.size > 0 && attempt >= 2) {
      throw new Error('Report index changed repeatedly during reindex');
    }
    const retry =
      conflicts.size > 0
        ? await this.indexReports([...conflicts], projectId, attempt + 1)
        : { indexed: 0, skipped: 0 };
    if (rows.length < stale.length) {
      throw new Error('Some report embeddings could not be generated');
    }
    return {
      indexed: rows.filter(row => !conflicts.has(row.entityId)).length + retry.indexed,
      skipped: skipped + retry.skipped,
    };
  }

  private async upsertDescriptor(
    entityType: SearchableEntityType,
    descriptor: EntityScoringDescriptor,
    document: string,
    hash: string
  ): Promise<void> {
    const vecs = await this.provider.embed([embeddingText(descriptor)], {
      inputType: 'search_document',
    });
    const vec = vecs[0] ?? null;
    if (vec === null) {
      this.logger.warn(
        `reindexEntity: ${entityType} ${descriptor.entityId} not indexed because embedding could not be generated`
      );
      await this.repository.upsert(entityType, {
        entityId: descriptor.entityId,
        projectId: descriptor.projectId,
        isDraft: descriptor.isDraft,
        embedding: null,
        document,
        fieldCount: descriptor.fieldCount,
        docHash: hash,
        updatedAt: new Date(),
      });
      throw new Error(
        `reindexEntity: ${entityType} ${descriptor.entityId} embedding could not be generated`
      );
    }

    await this.repository.upsert(entityType, {
      entityId: descriptor.entityId,
      projectId: descriptor.projectId,
      isDraft: descriptor.isDraft,
      embedding: vecToBuffer(vec),
      document,
      fieldCount: descriptor.fieldCount,
      docHash: hash,
      updatedAt: new Date(),
    });
  }

  private indexStateMatches<
    T extends { projectId: string; docHash: string; embeddingStatus: string },
  >(initial: T | undefined, current: T | undefined): boolean {
    if (!initial || !current) {
      return initial === current;
    }
    return (
      initial.projectId === current.projectId &&
      initial.docHash === current.docHash &&
      initial.embeddingStatus === current.embeddingStatus
    );
  }
}
