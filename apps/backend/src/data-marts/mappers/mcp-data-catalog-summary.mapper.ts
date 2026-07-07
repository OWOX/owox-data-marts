import { Injectable } from '@nestjs/common';
import { McpDataCatalogSummaryCandidateDto } from '../dto/domain/mcp-data-catalog-summary-candidate.dto';
import type { McpDataCatalogSummaryRawDataMart } from '../repositories/mcp-data-catalog-summary.repository';

@Injectable()
export class McpDataCatalogSummaryMapper {
  toCandidateDto(
    row: McpDataCatalogSummaryRawDataMart,
    counters: { reportsCount: number; triggersCount: number }
  ): McpDataCatalogSummaryCandidateDto {
    return new McpDataCatalogSummaryCandidateDto(
      row.id,
      row.title,
      row.description,
      counters.reportsCount,
      counters.triggersCount,
      row.modifiedAt instanceof Date ? row.modifiedAt : new Date(row.modifiedAt)
    );
  }
}
