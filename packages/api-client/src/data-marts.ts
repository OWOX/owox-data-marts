import { Buffer } from 'node:buffer';

import { OWOXApiError } from './errors.js';
import {
  HttpNdjsonTraversal,
  isRecord,
  type JsonRequester,
  type TraversalSource,
  withSourceContext,
} from './traversal.js';

export type OWOXDataMart = Record<string, unknown> & {
  id: string;
  title: string;
};

export type OWOXDataMartRow = Record<string, unknown>;

export type TraverseDataOptions = {
  columns?: '*' | '**';
  column?: string[];
  filter?: unknown[] | null;
  sort?: unknown[] | null;
  aggregation?: unknown[] | null;
  dateTrunc?: unknown[] | null;
  limit?: number;
};

type DataMartsPage = {
  items: OWOXDataMart[];
  total: number;
  nextOffset: number | null;
};

function parsePage(response: unknown): DataMartsPage {
  if (
    !isRecord(response) ||
    !Array.isArray(response.items) ||
    typeof response.total !== 'number' ||
    (typeof response.nextOffset !== 'number' && response.nextOffset !== null)
  ) {
    throw new OWOXApiError('OWOX Data Marts API returned an unexpected response shape', {
      details: response,
    });
  }

  return response as DataMartsPage;
}

function encodeBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function buildTraverseDataQuery(options: TraverseDataOptions): URLSearchParams | undefined {
  if (options.columns === '**' && (options.column?.length ?? 0) > 0) {
    throw new OWOXApiError('columns "**" cannot be combined with exact column values');
  }

  const query = new URLSearchParams();
  if (options.columns !== undefined) {
    query.append('columns', options.columns);
  }
  for (const column of options.column ?? []) {
    query.append('column', column);
  }
  if (options.filter != null) {
    query.append('filter', encodeBase64UrlJson(options.filter));
  }
  if (options.sort != null) {
    query.append('sort', encodeBase64UrlJson(options.sort));
  }
  if (options.aggregation != null) {
    query.append('aggregation', encodeBase64UrlJson(options.aggregation));
  }
  if (options.dateTrunc != null) {
    query.append('dateTrunc', encodeBase64UrlJson(options.dateTrunc));
  }
  if (options.limit !== undefined) {
    query.append('limit', String(options.limit));
  }

  return query.size === 0 ? undefined : query;
}

const DATA_MART_TRAVERSAL_SOURCE: TraversalSource = {
  idKey: 'dataMartId',
  label: 'OWOX Data Mart',
};

export class DataMartsApi {
  constructor(private readonly requester: JsonRequester) {}

  async list(): Promise<OWOXDataMart[]> {
    const dataMarts: OWOXDataMart[] = [];
    const requestedOffsets = new Set<string>();
    let offset: number | undefined;

    while (true) {
      const offsetKey = String(offset ?? 0);
      if (requestedOffsets.has(offsetKey)) {
        throw new OWOXApiError(`OWOX Data Marts API returned repeated nextOffset ${offsetKey}`, {
          details: { offset },
        });
      }

      requestedOffsets.add(offsetKey);

      const page = parsePage(
        await this.requester.getJson(
          '/api/data-marts',
          offset === undefined ? undefined : { offset: String(offset) }
        )
      );
      dataMarts.push(...page.items);

      if (page.nextOffset === null) {
        return dataMarts;
      }

      offset = page.nextOffset;
    }
  }

  async traverseData(
    dataMartId: string,
    options: TraverseDataOptions = {}
  ): Promise<HttpNdjsonTraversal> {
    const query = buildTraverseDataQuery(options);
    let response: Response;
    try {
      response = await this.requester.getStream(
        `/api/external/http-data/data-marts/${encodeURIComponent(dataMartId)}.ndjson`,
        query
      );
    } catch (error) {
      if (error instanceof OWOXApiError) {
        throw withSourceContext(error, DATA_MART_TRAVERSAL_SOURCE.idKey, dataMartId);
      }

      throw new OWOXApiError('Failed to open OWOX Data Mart data stream', {
        details: { dataMartId },
        cause: error,
      });
    }

    return new HttpNdjsonTraversal(response, dataMartId, DATA_MART_TRAVERSAL_SOURCE);
  }
}
