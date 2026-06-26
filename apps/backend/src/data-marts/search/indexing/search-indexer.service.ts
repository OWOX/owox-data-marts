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
    @Inject(ADVANCED_SEARCH_CONFIG) private readonly config: AdvancedSearchConfig
  ) {}

  async reindexEntity(
    entityType: SearchableEntityType,
    entityId: string,
    projectId?: string
  ): Promise<void> {
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

    await this.upsertDescriptor(source.entityType, descriptor);
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
    const limit = this.config.indexBatchSize;

    do {
      if (signal?.aborted) break;

      const page = await source.listSearchablePage(projectId, cursor, limit);
      cursor = page.nextCursor;

      if (page.descriptors.length === 0) break;

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

  private async upsertDescriptor(
    entityType: SearchableEntityType,
    descriptor: EntityScoringDescriptor
  ): Promise<void> {
    const document = buildDocument(descriptor);
    const hash = docHash(this.provider.modelId, indexSignature(descriptor, document));
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
