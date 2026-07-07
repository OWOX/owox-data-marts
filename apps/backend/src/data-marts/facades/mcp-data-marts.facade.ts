import type { FilterConfig } from '../dto/schemas/filter-config.schema';
import type { AggregationConfig } from '../dto/schemas/aggregation-config.schema';
import type { DateTruncConfig } from '../dto/schemas/date-trunc-config.schema';

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
  limit: number;
}

export interface McpQueryDataMartResponse {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
  totals: Record<string, number | string | boolean | null> | null;
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
  queryDataMart(request: McpQueryDataMartRequest): Promise<McpQueryDataMartResponse>;
  summarizeDataCatalog(
    request: McpSummarizeDataCatalogRequest
  ): Promise<McpDataCatalogSummaryResponse>;
}
