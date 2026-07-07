export interface McpDataCatalogSummaryItemDto {
  id: string;
  title: string;
  description: string;
  relationshipCount: number;
  reportsCount: number;
  triggersCount: number;
  updatedAt: string;
}

export interface McpDataCatalogSummaryDto {
  projectId: string;
  dataMartCount: number;
  topDataMartsByConnectivity: McpDataCatalogSummaryItemDto[];
}
