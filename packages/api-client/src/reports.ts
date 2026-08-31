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

/**
 * One column of a report's output, as a reader of the rows would name and understand it.
 *
 * `name` is the key each row from {@link ReportsApi.traverseData} is keyed by — the pairing is the
 * point: the stream carries values, this carries the names to put above them. Columns the report
 * synthesises (aggregated `revenue | SUM`, Unique Count, calculated fields) appear here and nowhere
 * in the Data Mart schema.
 */
export type OWOXReportOutputSchemaField = {
  name: string;
  title?: string;
  description?: string;
  type?: string;
  /** The aggregate function the report applies to this column, when it applies one. */
  aggregateFunction?: string;
  /**
   * Calculated fields only. `metric` means the formula AGGREGATES — re-aggregating it is wrong at
   * any grain, whatever `type` says. `column` means row-level, with no warehouse column behind it.
   * Absent is an ordinary native column, which may be rolled up.
   */
  calculatedFieldLevel?: 'metric' | 'column';
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

  /**
   * The columns the report's rows will carry, in the order they are projected.
   *
   * Resolved from the stored schema and the report config, so it can be read before — or without —
   * traversing any data.
   */
  async getOutputSchema(reportId: string): Promise<OWOXReportOutputSchemaField[]> {
    let response: unknown;
    try {
      response = await this.requester.getJson<unknown>(
        `/api/reports/${encodeURIComponent(reportId)}/output-schema`
      );
    } catch (error) {
      if (error instanceof OWOXApiError) {
        throw withSourceContext(error, REPORT_TRAVERSAL_SOURCE.idKey, reportId);
      }
      throw new OWOXApiError('Failed to read OWOX report output schema', {
        details: { reportId },
        cause: error,
      });
    }

    if (!Array.isArray(response)) {
      throw new OWOXApiError(
        'OWOX report output schema API returned an unexpected response shape',
        {
          details: { reportId, response },
        }
      );
    }

    return response as OWOXReportOutputSchemaField[];
  }
}
