import type { FilterConfig } from '../dto/schemas/filter-config.schema';
import type { AggregationConfig } from '../dto/schemas/aggregation-config.schema';
import type { DateTruncConfig } from '../dto/schemas/date-trunc-config.schema';
import type { SortConfig } from '../dto/schemas/sort-config.schema';

export const MCP_DATA_MARTS_FACADE = Symbol('MCP_DATA_MARTS_FACADE');

export interface McpListDataMartsRequest {
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpSummarizeDataCatalogRequest {
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpGetDataMartDetailsRequest extends McpListDataMartsRequest {
  dataMartId: string;
}

export interface McpDataMartListItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  updatedAt: string;
}

export interface McpListDataMartsResponse {
  dataMarts: McpDataMartListItem[];
}

export interface McpJoinedFieldDto {
  name: string;
  type: string;
  description: string;
  sourceDataMart: string;
  allowedAggregations?: string[];
}

export interface McpDataMartDetailsResponse {
  id: string;
  name: string;
  description: string;
  fields: Array<Record<string, unknown>>;
  joinedFields: McpJoinedFieldDto[];
}

export interface McpQueryDataMartRequest {
  projectId: string;
  userId: string;
  roles: string[];
  dataMartId: string;
  fields: string[];
  filterConfig?: FilterConfig;
  aggregationConfig?: AggregationConfig;
  dateTruncConfig?: DateTruncConfig;
  sortConfig?: SortConfig;
  limit: number;
}

export interface McpQueryDataMartResponse {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
  totals: Record<string, number | string | boolean | null> | null;
  executedSql?: string;
}

export interface McpDataCatalogSummaryItem {
  id: string;
  title: string;
  description: string;
  relationshipCount: number;
  reportsCount: number;
  triggersCount: number;
  updatedAt: string;
}

export interface McpDataCatalogSummaryResponse {
  projectId: string;
  dataMartCount: number;
  topDataMartsByConnectivity: McpDataCatalogSummaryItem[];
}

export interface McpDataMartsFacade {
  listDataMarts(request: McpListDataMartsRequest): Promise<McpListDataMartsResponse>;
  getDataMartDetails(request: McpGetDataMartDetailsRequest): Promise<McpDataMartDetailsResponse>;
  queryDataMart(
    request: McpQueryDataMartRequest,
    signal?: AbortSignal
  ): Promise<McpQueryDataMartResponse>;
  summarizeDataCatalog(
    request: McpSummarizeDataCatalogRequest
  ): Promise<McpDataCatalogSummaryResponse>;
}

// Part of the queryDataMart contract: the tool catches these to emit query_timeout / query_cancelled.
// They live on the facade surface (not in the use-case) so consumers don't reach into internals.

// Recorded FAILED and never billed (billing is success-path only).
export class QueryTimeoutError extends Error {
  readonly deadlineMs: number;
  constructor(deadlineMs: number) {
    super(`query_data_mart timed out after ${deadlineMs} ms`);
    this.name = 'QueryTimeoutError';
    this.deadlineMs = deadlineMs;
  }
}

// Client aborted (disconnect / cancel). Recorded CANCELLED, never billed. Stops the server waiting
// and asks the warehouse to cancel the in-flight job/statement (for storages that honor it).
export class QueryAbortedError extends Error {
  constructor() {
    super('query_data_mart was cancelled by the client');
    this.name = 'QueryAbortedError';
  }
}
