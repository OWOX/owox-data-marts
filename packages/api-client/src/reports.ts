import { OWOXApiError } from './errors.js';
import {
  HttpNdjsonTraversal,
  type JsonRequester,
  type TraversalSource,
  withSourceContext,
} from './traversal.js';

const REPORT_TRAVERSAL_SOURCE: TraversalSource = { idKey: 'reportId', label: 'OWOX report' };

export type TraverseReportDataOptions = {
  limit?: number;
};

export class ReportsApi {
  constructor(private readonly requester: JsonRequester) {}

  async traverseData(
    reportId: string,
    options: TraverseReportDataOptions = {}
  ): Promise<HttpNdjsonTraversal> {
    const query = new URLSearchParams();
    if (options.limit !== undefined) {
      query.append('limit', String(options.limit));
    }

    let response: Response;
    try {
      response = await this.requester.getStream(
        `/api/external/http-data/reports/${encodeURIComponent(reportId)}.ndjson`,
        query.size === 0 ? undefined : query
      );
    } catch (error) {
      if (error instanceof OWOXApiError) {
        throw withSourceContext(error, REPORT_TRAVERSAL_SOURCE.idKey, reportId);
      }
      throw new OWOXApiError('Failed to open OWOX report data stream', {
        details: { reportId },
        cause: error,
      });
    }

    return new HttpNdjsonTraversal(response, reportId, REPORT_TRAVERSAL_SOURCE);
  }
}
