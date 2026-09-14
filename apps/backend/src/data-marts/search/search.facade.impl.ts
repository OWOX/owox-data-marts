import { Inject, Injectable } from '@nestjs/common';
import { PublicOriginService } from '../../common/config/public-origin.service';
import {
  SEARCH_SEMANTIC_ENGINE,
  SearchableEntityType,
  SearchEngine,
  SearchFacade,
  SearchOptions,
  SearchResult,
} from '../../common/search/search.facade';

export function buildReportUiPath(projectId: string, dataMartId: string, reportId: string): string {
  return `/ui/${encodeURIComponent(projectId)}/data-marts/${encodeURIComponent(dataMartId)}/reports?reportId=${encodeURIComponent(reportId)}`;
}

@Injectable()
export class SearchFacadeImpl implements SearchFacade {
  constructor(
    @Inject(SEARCH_SEMANTIC_ENGINE)
    private readonly engine: SearchEngine,
    private readonly publicOriginService: PublicOriginService
  ) {}

  async search(projectId: string, prompt: string, options: SearchOptions): Promise<SearchResult[]> {
    const results = await this.engine.search(projectId, prompt, options);
    const origin = `${this.publicOriginService.getPublicOrigin().replace(/\/+$/, '')}/`;

    return results.map(result =>
      result.entityType === SearchableEntityType.REPORT && result.report
        ? {
            ...result,
            url: new URL(
              buildReportUiPath(projectId, result.report.dataMart.id, result.entityId),
              origin
            ).toString(),
          }
        : result
    );
  }
}
