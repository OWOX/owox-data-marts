import { Injectable } from '@nestjs/common';
import { McpDataCatalogSummaryCandidateDto } from '../dto/domain/mcp-data-catalog-summary-candidate.dto';
import { McpDataCatalogSummaryMapper } from '../mappers/mcp-data-catalog-summary.mapper';
import {
  McpDataCatalogSummaryQuery,
  McpDataCatalogSummaryRepository,
} from '../repositories/mcp-data-catalog-summary.repository';

@Injectable()
export class McpDataCatalogSummaryService {
  constructor(
    private readonly repository: McpDataCatalogSummaryRepository,
    private readonly mapper: McpDataCatalogSummaryMapper
  ) {}

  async findPublishedVisibleDataMarts(
    query: McpDataCatalogSummaryQuery
  ): Promise<McpDataCatalogSummaryCandidateDto[]> {
    const rows = await this.repository.listPublishedVisibleDataMartRows(query);
    const ids = rows.map(row => row.id);
    const [triggerCounts, reportCounts] =
      ids.length === 0
        ? [new Map<string, number>(), new Map<string, number>()]
        : await Promise.all([
            this.repository.countTriggersByDataMartIds(ids),
            this.repository.countReportsByDataMartIds(ids),
          ]);

    return rows.map(row =>
      this.mapper.toCandidateDto(row, {
        reportsCount: reportCounts.get(row.id) ?? 0,
        triggersCount: triggerCounts.get(row.id) ?? 0,
      })
    );
  }
}
