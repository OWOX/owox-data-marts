export const DATA_MART_CATALOG = Symbol('DATA_MART_CATALOG');

export interface SearchableDataMart {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  fieldNames: string[];
  contexts: { name: string; content: string }[];
  modifiedAt: Date;
}

export interface RelationshipEdge {
  sourceDataMartId: string;
  targetDataMartId: string;
}

export interface DataMartAccessScope {
  userId: string;
  roles: string[];
}

export interface DataMartCatalogPort {
  listSearchable(
    projectId?: string,
    accessScope?: DataMartAccessScope
  ): Promise<SearchableDataMart[]>;
  listRelationships(projectId: string): Promise<RelationshipEdge[]>;
  listLiveIds(projectId?: string): Promise<Set<string>>;
}
