export const ADVANCED_SEARCH_FACADE = Symbol('ADVANCED_SEARCH_FACADE');

export enum SearchableEntityType {
  DATA_MART = 'DATA_MART',
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

export interface AdvancedSearchAccessScope {
  userId: string;
  roles: string[];
}

export interface AdvancedSearchOptions {
  topK?: number;
  entityTypes?: SearchableEntityType[];
  accessScope?: AdvancedSearchAccessScope;
}

export interface AdvancedSearchFacade {
  search(
    projectId: string,
    prompt: string,
    options?: AdvancedSearchOptions
  ): Promise<SearchResult[]>;
  reindexDataMart(dataMartId: string): Promise<void>;
}
