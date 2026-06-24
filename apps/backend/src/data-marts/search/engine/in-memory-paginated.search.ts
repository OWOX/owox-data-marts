import { Injectable, Logger } from '@nestjs/common';
import { SearchableEntityType } from '../../../common/search/search.facade';
import type { ScoringConfig } from './scoring-config';
import { IndexableSourceRegistry } from '../sources/indexable-source.registry';
import { SearchIndexRepository, StreamedIndexRow } from '../schema/search-index.repository';
import { parseDocument } from '../indexing/document-builder';
import { scoreEntity, computeExtendability } from './scoring';
import { bufferToVec, cosineSim } from '../embedding/vector-codec';
import { tokenize } from './tokenizer';
import { TopKBuffer } from './top-k-buffer';
import type { VectorSearchPort, VectorSearchOptions, ScoredEntity } from './vector-search.port';

function scoreRow(
  row: StreamedIndexRow,
  entityType: SearchableEntityType,
  promptTokens: string[],
  promptVec: Float32Array | null,
  config: ScoringConfig
): ScoredEntity | null {
  if (!row.document) return null;

  let parsed: ReturnType<typeof parseDocument>;
  try {
    parsed = parseDocument(row.document);
  } catch {
    return null;
  }

  const descriptor = {
    entityType,
    entityId: row.entityId,
    projectId: row.projectId,
    title: parsed.title,
    description: parsed.description,
    richTextSlots: parsed.richTextSlots,
    atomicTokenSlots: parsed.atomicTokenSlots,
    fieldCount: row.fieldCount ?? 0,
    extendability: 0,
    modifiedAt: row.updatedAt,
    embeddingText: parsed.embeddingText ?? '',
    isDraft: row.isDraft,
  };

  const kwScore = scoreEntity(descriptor, promptTokens, config);

  let vecScore: number | null = null;
  let keywordsSimilarity = kwScore;
  if (promptVec !== null) {
    if (!row.embedding) return null;
    const entityVec = bufferToVec(row.embedding);
    const sim = cosineSim(promptVec, entityVec);
    if (sim === null) return null;
    vecScore = Math.round(Math.max(0, sim) * 100);
    keywordsSimilarity = Math.round(
      vecScore * config.vecBlendWeight + kwScore * config.kwBlendWeight
    );
  }

  const fieldCount = row.fieldCount ?? 0;
  const extendability = computeExtendability(fieldCount, config);

  const finalScore = keywordsSimilarity + extendability;
  const relevance = keywordsSimilarity;

  return {
    entityType,
    entityId: row.entityId,
    title: parsed.title,
    description: parsed.description,
    finalScore,
    kwScore,
    vecScore,
    extendability,
    relevance,
  };
}

@Injectable()
export class InMemoryPaginatedSearch implements VectorSearchPort {
  private readonly logger = new Logger(InMemoryPaginatedSearch.name);

  constructor(
    private readonly registry: IndexableSourceRegistry,
    private readonly repository: SearchIndexRepository
  ) {}

  async search(
    entityType: SearchableEntityType,
    projectId: string,
    prompt: string,
    promptVec: Float32Array | null,
    options: VectorSearchOptions
  ): Promise<ScoredEntity[]> {
    const source = this.registry.resolve(entityType);
    if (!source) return [];
    if (promptVec === null) {
      this.logger.warn(
        this.formatLogLine('advanced-search prompt embedding unavailable; using keyword fallback', {
          entityType,
          projectId,
        })
      );
    }

    this.logger.log(
      this.formatLogLine('advanced-search vector search mode', {
        mode: 'database-candidate-query',
        scoring: 'application-vector',
        entityType,
        projectId,
        promptVecAvailable: promptVec !== null,
        topK: options.topK,
        minRelevance: options.minRelevance,
        candidateLimit: options.candidateLimit,
        excludeDrafts: options.excludeDrafts === true,
      })
    );

    const promptTokens = Array.from(tokenize(prompt));

    const predicate = await source.accessPredicateProvider.build(
      'idx',
      projectId,
      options.accessScope
    );

    const buffer = new TopKBuffer<ScoredEntity>(options.topK);
    const page = await this.repository.searchCandidates(entityType, projectId, predicate, prompt, {
      candidateLimit: options.candidateLimit,
      vectorCandidateLimit: options.vectorCandidateLimit,
      excludeDrafts: options.excludeDrafts,
      promptVec,
    });

    for (const row of page.rows) {
      const scored = scoreRow(row, entityType, promptTokens, promptVec, source.scoringConfig);
      if (scored === null) continue;
      if (scored.relevance < options.minRelevance) continue;

      buffer.add(scored.finalScore, scored);
    }

    return buffer.drainSorted();
  }

  private formatLogLine(
    message: string,
    fields: Record<string, string | number | boolean>
  ): string {
    const context = Object.entries(fields)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ');

    return `${message} ${context}`;
  }
}
