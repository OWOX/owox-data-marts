import type { PageCursor, SearchablePage } from '../sources/indexable-source.port';

export const DATA_MART_CATALOG = Symbol('DATA_MART_CATALOG');

export interface SearchableDataMartField {
  name: string;
  alias: string | null;
  description: string | null;
}

export interface SearchableDataMart {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  fieldNames: string[];
  fieldDetails: SearchableDataMartField[];
  modifiedAt: Date;
  isDraft: boolean;
}

export interface RelationshipEdge {
  sourceDataMartId: string;
  targetDataMartId: string;
}

export interface DataMartCatalogPort {
  listSearchablePage(
    projectId: string,
    cursor: PageCursor | null,
    limit: number
  ): Promise<SearchablePage>;
  loadSearchable(entityId: string): Promise<SearchableDataMart | null>;
  listOutboundEdges(sourceDataMartId: string): Promise<RelationshipEdge[]>;
  listOutboundEdgesFor(sourceIds: string[]): Promise<RelationshipEdge[]>;
  listProjectIds(): Promise<string[]>;
}
