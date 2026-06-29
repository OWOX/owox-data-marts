import { SearchableEntityType } from '../../../common/search/search.facade';
import type { SourceAccessScope } from '../sources/indexable-source.port';

export const VECTOR_SEARCH_PORT = Symbol('VECTOR_SEARCH_PORT');

export interface ScoredEntity {
  entityType: SearchableEntityType;
  entityId: string;
  title: string;
  description: string | null;
  finalScore: number;
  kwScore: number;
  vecScore: number | null;
  extendability: number;
  relevance: number;
}

export interface VectorSearchOptions {
  topK: number;
  minRelevance: number;
  candidateLimit: number;
  vectorCandidateLimit?: number;
  accessScope?: SourceAccessScope;
  excludeDrafts?: boolean;
}

export interface VectorSearchPort {
  search(
    entityType: SearchableEntityType,
    projectId: string,
    prompt: string,
    promptVec: Float32Array | null,
    options: VectorSearchOptions
  ): Promise<ScoredEntity[]>;
}
