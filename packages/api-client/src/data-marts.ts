import { Buffer } from 'node:buffer';

import { OWOXApiError } from './errors.js';
import {
  HttpNdjsonTraversal,
  type JsonRequester,
  type TraversalSource,
  withSourceContext,
} from './traversal.js';
import { isRecord, isRfc3339DateTimeString, isUserProjection } from './validation.js';

// Keep the traversal rule literals below in sync with the backend schemas in
// `apps/backend/src/data-marts/dto/schemas/{aggregate-function,filter-config,sort-config,date-trunc-config}.schema.ts`.
const DATA_MART_STATUS_VALUES = ['DRAFT', 'PUBLISHED'] as const;
export type OWOXDataMartStatus = (typeof DATA_MART_STATUS_VALUES)[number];

const DATA_MART_DEFINITION_TYPE_VALUES = [
  'SQL',
  'TABLE',
  'VIEW',
  'TABLE_PATTERN',
  'CONNECTOR',
] as const;
export type OWOXDataMartDefinitionType = (typeof DATA_MART_DEFINITION_TYPE_VALUES)[number];

const DATA_STORAGE_TYPE_VALUES = [
  'GOOGLE_BIGQUERY',
  'AWS_ATHENA',
  'SNOWFLAKE',
  'AWS_REDSHIFT',
  'DATABRICKS',
  'LEGACY_GOOGLE_BIGQUERY',
] as const;
export type OWOXDataMartStorageType = (typeof DATA_STORAGE_TYPE_VALUES)[number];

export type OWOXDataMartStorage = {
  type: OWOXDataMartStorageType;
  title: string;
};

export type OWOXDataMartUser = {
  userId: string;
  fullName?: string | null;
  email?: string | null;
  avatar?: string | null;
};

export type OWOXDataMartContext = {
  id: string;
  name: string;
};

const DATA_MART_OWNER_FILTER_VALUES = ['has_owners', 'no_owners'] as const;
export type OWOXDataMartOwnerFilter = (typeof DATA_MART_OWNER_FILTER_VALUES)[number];

export type OWOXDataMartListOptions = {
  offset?: number;
  ownerFilter?: OWOXDataMartOwnerFilter;
};

export type OWOXDataMart = Record<string, unknown> & {
  id: string;
  title: string;
  status: OWOXDataMartStatus;
  storage: OWOXDataMartStorage;
  description: string | null;
  definitionType?: OWOXDataMartDefinitionType | null;
  connectorSourceName?: string;
  triggersCount: number;
  reportsCount: number;
  createdByUser: OWOXDataMartUser | null;
  businessOwnerUsers: OWOXDataMartUser[];
  technicalOwnerUsers: OWOXDataMartUser[];
  createdAt: string;
  modifiedAt: string;
  contexts: OWOXDataMartContext[];
  availableForReporting: boolean;
  availableForMaintenance: boolean;
};

export type OWOXDataMartRow = Record<string, unknown>;

export type TraverseDataAggregateFunction =
  | 'STRING_AGG'
  | 'MAX'
  | 'MIN'
  | 'SUM'
  | 'AVG'
  | 'COUNT'
  | 'COUNT_DISTINCT'
  | 'ANY_VALUE'
  | 'P25'
  | 'P50'
  | 'P75'
  | 'P95';

export type TraverseDataRelativeDatePreset =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'this_month' }
  | { kind: 'last_month' }
  | { kind: 'this_year' }
  | { kind: 'last_n_days'; n: number }
  | { kind: 'last_n_months'; n: number };

type TraverseDataScalarValue = string | number | boolean;
type TraverseDataFilterPlacement = {
  placement?: 'pre-join' | 'post-join';
  function?: TraverseDataAggregateFunction;
};

export type TraverseDataFilterRule = (
  | {
      column: string;
      operator:
        | 'eq'
        | 'neq'
        | 'contains'
        | 'not_contains'
        | 'starts_with'
        | 'ends_with'
        | 'gt'
        | 'lt'
        | 'gte'
        | 'lte'
        | 'regex'
        | 'not_regex';
      value: TraverseDataScalarValue;
    }
  | {
      column: string;
      operator: 'is_empty' | 'is_not_empty' | 'is_null' | 'is_not_null' | 'is_true' | 'is_false';
    }
  | {
      column: string;
      operator: 'between';
      value: { from: TraverseDataScalarValue; to: TraverseDataScalarValue };
    }
  | {
      column: string;
      operator: 'relative_date';
      value: TraverseDataRelativeDatePreset;
    }
) &
  TraverseDataFilterPlacement;

export type TraverseDataSortRule = {
  column: string;
  direction: 'asc' | 'desc';
};

export type TraverseDataAggregationRule = {
  column: string;
  function: TraverseDataAggregateFunction;
};

export type TraverseDataDateTruncRule = {
  column: string;
  unit: 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
  timeZone?: string;
};

export type TraverseDataOptions = {
  columns?: '*' | '**';
  column?: string[];
  filter?: TraverseDataFilterRule[] | null;
  sort?: TraverseDataSortRule[] | null;
  aggregation?: TraverseDataAggregationRule[] | null;
  dateTrunc?: TraverseDataDateTruncRule[] | null;
  limit?: number;
};

type DataMartsPage = {
  items: OWOXDataMart[];
  total: number;
  nextOffset: number | null;
};

const DATA_MART_STATUSES = new Set<string>(DATA_MART_STATUS_VALUES);
const DATA_MART_DEFINITION_TYPES = new Set<string>(DATA_MART_DEFINITION_TYPE_VALUES);
const DATA_STORAGE_TYPES = new Set<string>(DATA_STORAGE_TYPE_VALUES);
const DATA_MART_OWNER_FILTERS = new Set<string>(DATA_MART_OWNER_FILTER_VALUES);

function isUser(value: unknown): value is OWOXDataMartUser {
  return isUserProjection(value);
}

function isContext(value: unknown): value is OWOXDataMartContext {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isDataMart(value: unknown): value is OWOXDataMart {
  if (!isRecord(value) || !isRecord(value.storage)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.status === 'string' &&
    DATA_MART_STATUSES.has(value.status) &&
    typeof value.storage.type === 'string' &&
    DATA_STORAGE_TYPES.has(value.storage.type) &&
    typeof value.storage.title === 'string' &&
    (typeof value.description === 'string' || value.description === null) &&
    (value.definitionType === undefined ||
      value.definitionType === null ||
      (typeof value.definitionType === 'string' &&
        DATA_MART_DEFINITION_TYPES.has(value.definitionType))) &&
    (value.connectorSourceName === undefined || typeof value.connectorSourceName === 'string') &&
    Number.isInteger(value.triggersCount) &&
    (value.triggersCount as number) >= 0 &&
    Number.isInteger(value.reportsCount) &&
    (value.reportsCount as number) >= 0 &&
    (value.createdByUser === null || isUser(value.createdByUser)) &&
    Array.isArray(value.businessOwnerUsers) &&
    value.businessOwnerUsers.every(isUser) &&
    Array.isArray(value.technicalOwnerUsers) &&
    value.technicalOwnerUsers.every(isUser) &&
    isRfc3339DateTimeString(value.createdAt) &&
    isRfc3339DateTimeString(value.modifiedAt) &&
    Array.isArray(value.contexts) &&
    value.contexts.every(isContext) &&
    typeof value.availableForReporting === 'boolean' &&
    typeof value.availableForMaintenance === 'boolean'
  );
}

function validateListOptions(options: unknown): asserts options is OWOXDataMartListOptions {
  if (
    !isRecord(options) ||
    (options.offset !== undefined &&
      (!Number.isInteger(options.offset) || (options.offset as number) < 0)) ||
    (options.ownerFilter !== undefined &&
      (typeof options.ownerFilter !== 'string' ||
        !DATA_MART_OWNER_FILTERS.has(options.ownerFilter)))
  ) {
    throw new OWOXApiError('Invalid OWOX Data Mart list options', {
      details: options,
    });
  }
}

function parsePage(response: unknown): DataMartsPage {
  if (
    !isRecord(response) ||
    !Array.isArray(response.items) ||
    !response.items.every(isDataMart) ||
    !Number.isInteger(response.total) ||
    (response.total as number) < 0 ||
    (response.nextOffset !== null &&
      (!Number.isInteger(response.nextOffset) || (response.nextOffset as number) < 0))
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

  async list(options: OWOXDataMartListOptions = {}): Promise<OWOXDataMart[]> {
    validateListOptions(options);

    const dataMarts: OWOXDataMart[] = [];
    const requestedOffsets = new Set<string>();
    let offset = options.offset;

    while (true) {
      const offsetKey = String(offset ?? 0);
      if (requestedOffsets.has(offsetKey)) {
        throw new OWOXApiError(`OWOX Data Marts API returned repeated nextOffset ${offsetKey}`, {
          details: { offset },
        });
      }

      requestedOffsets.add(offsetKey);

      const page = parsePage(
        await this.requester.getJson<unknown>(
          '/api/data-marts',
          offset === undefined && options.ownerFilter === undefined
            ? undefined
            : {
                ...(offset === undefined ? {} : { offset: String(offset) }),
                ...(options.ownerFilter === undefined ? {} : { ownerFilter: options.ownerFilter }),
              }
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

    const contentType = response.headers.get('content-type');
    const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase();
    if (mediaType !== 'application/x-ndjson') {
      await response.body?.cancel().catch(() => undefined);
      throw new OWOXApiError('OWOX Data Mart data stream returned an unexpected content type', {
        status: response.status,
        details: {
          dataMartId,
          contentType: contentType ?? null,
        },
      });
    }

    return new HttpNdjsonTraversal(response, dataMartId, DATA_MART_TRAVERSAL_SOURCE);
  }
}
