import { Inject, Injectable, Logger } from '@nestjs/common';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { DATA_MART_CATALOG, DataMartCatalogPort } from '../catalog/data-mart-catalog.port';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../embedding/embedding-provider';
import { SearchIndexRepository } from '../schema/search-index.repository';
import { buildDocument, docHash } from './document-builder';
import { vecToBuffer } from '../embedding/vector-codec';

@Injectable()
export class SearchIndexerService {
  private readonly logger = new Logger(SearchIndexerService.name);
  private readonly reconcileInFlight = new Set<string>();

  constructor(
    @Inject(DATA_MART_CATALOG) private readonly catalog: DataMartCatalogPort,
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    private readonly repository: SearchIndexRepository,
    @Inject(ADVANCED_SEARCH_CONFIG) private readonly config: AdvancedSearchConfig
  ) {}

  async reconcile(projectId?: string): Promise<void> {
    const key = projectId ?? '*';
    if (this.reconcileInFlight.has(key) || this.reconcileInFlight.has('*')) {
      this.logger.debug(`reconcile already in flight for key=${key} — skipping`);
      return;
    }
    this.reconcileInFlight.add(key);
    try {
      await this.doReconcile(projectId);
    } catch (err) {
      this.logger.error(`reconcile failed for key=${key}`, err);
    } finally {
      this.reconcileInFlight.delete(key);
    }
  }

  async reindexDataMart(dataMartId: string, projectId?: string): Promise<void> {
    const all = await this.catalog.listSearchable(projectId);
    const mart = all.find(m => m.id === dataMartId);
    if (!mart) {
      this.logger.debug(`reindexDataMart: mart ${dataMartId} not found in catalog, skipping`);
      return;
    }
    const doc = buildDocument(mart);
    const hash = docHash(this.provider.modelId, doc);
    const vecs = await this.provider.embed([doc]);
    const vec = vecs[0] ?? null;
    await this.repository.upsert({
      dataMartId: mart.id,
      projectId: mart.projectId,
      embedding: vec ? vecToBuffer(vec) : null,
      dim: vec ? vec.length : null,
      docHash: hash,
      model: this.provider.modelId,
      updatedAt: new Date(),
    });
  }

  private async doReconcile(projectId?: string): Promise<void> {
    const start = performance.now();
    const marts = await this.catalog.listSearchable(projectId);
    const indexedHashes = await this.repository.listHashes(projectId);

    const stale = marts.filter(m => {
      const doc = buildDocument(m);
      const hash = docHash(this.provider.modelId, doc);
      return indexedHashes.get(m.id) !== hash;
    });

    let indexed = 0;
    const skipped = marts.length - stale.length;
    let embedFailed = 0;
    let errors = 0;

    const batchSize = this.config.indexBatchSize;
    for (let i = 0; i < stale.length; i += batchSize) {
      const batch = stale.slice(i, i + batchSize);
      try {
        const docs = batch.map(m => buildDocument(m));
        const vecs = await this.provider.embed(docs);
        const now = new Date();
        for (let j = 0; j < batch.length; j++) {
          const mart = batch[j]!;
          const vec = vecs[j] ?? null;
          const doc = docs[j]!;
          const hash = docHash(this.provider.modelId, doc);
          if (vec === null) embedFailed++;
          await this.repository.upsert({
            dataMartId: mart.id,
            projectId: mart.projectId,
            embedding: vec ? vecToBuffer(vec) : null,
            dim: vec ? vec.length : null,
            docHash: hash,
            model: this.provider.modelId,
            updatedAt: now,
          });
          indexed++;
        }
      } catch (err) {
        errors += batch.length;
        this.logger.error(`reconcile: batch error (offset ${i})`, err);
      }
    }

    const liveIds = await this.catalog.listLiveIds(projectId);
    const deletedOrphans = await this.repository.deleteAllExcept(liveIds);

    const durationMs = Math.round(performance.now() - start);

    this.logger.log(
      `reconcile done — indexed: ${indexed}, skipped: ${skipped}, embedFailed: ${embedFailed}, deletedOrphans: ${deletedOrphans}, errors: ${errors}, durationMs: ${durationMs}`
    );

    if (embedFailed > 0) {
      this.logger.warn(
        `reconcile: ${embedFailed} mart(s) stored without embedding due to embed failure`
      );
    }
  }
}
