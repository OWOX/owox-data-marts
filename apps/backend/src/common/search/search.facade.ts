export const SEARCH_FACADE = Symbol('SEARCH_FACADE');
export const SEARCH_SEMANTIC_ENGINE = Symbol('SEARCH_SEMANTIC_ENGINE');

export enum SearchableEntityType {
  DATA_MART = 'DATA_MART',
  DATA_STORAGE = 'DATA_STORAGE',
  DATA_DESTINATION = 'DATA_DESTINATION',
}

export interface SearchResult {
  entityType: SearchableEntityType;
  entityId: string;
  title: string;
  description: string | null;
  finalScore: number;
  kwScore: number;
  vecScore: number | null;
  extendability: number;
}

export interface SearchAccessScope {
  userId: string;
  roles: string[];
}

export interface SearchOptions {
  accessScope: SearchAccessScope;
  topK?: number;
  entityTypes?: SearchableEntityType[];
  excludeDrafts?: boolean;
}

export interface SearchEngine {
  search(projectId: string, prompt: string, options: SearchOptions): Promise<SearchResult[]>;
}

export type SearchFacade = SearchEngine;
