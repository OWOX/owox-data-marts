import type { FilterConfig } from '../dto/schemas/filter-config.schema';
import type { AggregationConfig } from '../dto/schemas/aggregation-config.schema';
import type { DateTruncConfig } from '../dto/schemas/date-trunc-config.schema';
import type { SortConfig } from '../dto/schemas/sort-config.schema';
import type { SourceDataLastUpdated } from '../dto/schemas/source-data-last-updated.schema';
import { JOINED_UNIQUE_COUNT_NAME_SUFFIX } from '../dto/schemas/unique-count-sources';

export const MCP_DATA_MARTS_FACADE = Symbol('MCP_DATA_MARTS_FACADE');

/**
 * The SQL-safe suffix every `McpUniqueCountSourceDto.name` ends with, e.g. `orders__unique_count`.
 * Published here, next to the DTO that carries those names, so a consumer can recognise one without
 * re-deriving the naming rule from this module's internals (#6792).
 */
export const MCP_UNIQUE_COUNT_FIELD_SUFFIX = JOINED_UNIQUE_COUNT_NAME_SUFFIX;

export type McpDataMartCatalogStatus = 'published' | 'draft';

export interface McpListDataMartsRequest {
  projectId: string;
  userId: string;
  roles: string[];
  /**
   * Published is the default state for the reporting catalog. Drafts are discoverable only when
   * explicitly requested; all other MCP Data Mart operations still require published state.
   */
  status?: McpDataMartCatalogStatus;
}

export interface McpSummarizeDataCatalogRequest {
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpGetDataMartDetailsRequest {
  projectId: string;
  userId: string;
  roles: string[];
  dataMartId: string;
  includeJoinedFields?: boolean;
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
  displayName: string;
  type: string;
  description: string;
  sourceDataMart: string;
  /**
   * Pre-join RAW type, present only when this field's dedup changes its type (e.g. STRING deduped
   * by COUNT → effective INTEGER). A slice runs before the join on the raw value, so slice operators
   * must match this type, not `type` (the blended-result type used by filters/aggregations).
   */
  sliceType?: string;
  allowedAggregations?: string[];
}

/**
 * A joined source's Unique Count pseudo-field, keyed by the SAME SQL-safe `name` that
 * appears in `McpDataMartDetailsResponse.joinedFields` — internal only, never serialized
 * back to an MCP client. `query_data_mart` uses `aliasPath` to translate a selected
 * pseudo-field back into `McpQueryDataMartRequest.uniqueCountConfig`.
 */
export interface McpUniqueCountSourceDto {
  aliasPath: string;
  name: string;
  displayName: string;
}

export interface McpDataMartDetailsResponse {
  id: string;
  name: string;
  description: string;
  fields: Array<Record<string, unknown>>;
  joinedFields: McpJoinedFieldDto[];
  uniqueCountSources: McpUniqueCountSourceDto[];
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
  /** aliasPaths of joined sources to include a `<Prefix> Unique Count` column for. */
  uniqueCountConfig?: string[];
}

export interface McpQueryDataMartResponse {
  columns: string[];
  columnMetadata: Array<{
    name: string;
    displayName: string;
    description?: string;
    type?: string;
  }>;
  rows: unknown[][];
  truncated: boolean;
  totals: Record<string, number | string | boolean | null> | null;
  /**
   * When the source tables behind this result last changed at the warehouse. Best effort —
   * `coverage: 'unavailable'` with a null timestamp is a normal outcome, not a failure.
   */
  dataLastUpdated: SourceDataLastUpdated;
  /**
   * Why `totals` is null, when the reason is a FAILURE rather than "this report has no totals
   * metric". Totals are computed best-effort so a failure never costs the caller its rows — but
   * silently dropping them reads as "this report has no totals", and the caller then either
   * reports no total or sums the page itself (wrong for any non-additive metric). Naming the
   * failure is what makes that distinguishable.
   */
  totalsError?: string;
  dataMart: {
    id: string;
    title: string;
  };
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

// Never billed, and never recorded in Run History (both are success-path only).
export class QueryTimeoutError extends Error {
  readonly deadlineMs: number;
  constructor(deadlineMs: number) {
    super(`query_data_mart timed out after ${deadlineMs} ms`);
    this.name = 'QueryTimeoutError';
    this.deadlineMs = deadlineMs;
  }
}

// Client aborted (disconnect / cancel). Never billed or recorded. Stops the server waiting
// and asks the warehouse to cancel the in-flight job/statement (for storages that honor it).
export class QueryAbortedError extends Error {
  constructor() {
    super('query_data_mart was cancelled by the client');
    this.name = 'QueryAbortedError';
  }
}
