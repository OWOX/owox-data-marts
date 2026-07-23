import { OWOXApiError } from './errors.js';

export type OWOXSearchEntityType = 'DATA_MART' | 'DATA_STORAGE' | 'DATA_DESTINATION';

export type OWOXSearchResult = {
  entityType: OWOXSearchEntityType;
  entityId: string;
  title: string;
  description: string | null;
  finalScore: number;
  kwScore: number;
  vecScore: number | null;
};

export type OWOXSearchOptions = {
  limit?: number;
  entityTypes?: OWOXSearchEntityType[];
  excludeDrafts?: boolean;
};

type SearchRequester = {
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>;
};

const SEARCH_ENTITY_TYPES = new Set<OWOXSearchEntityType>([
  'DATA_MART',
  'DATA_STORAGE',
  'DATA_DESTINATION',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSearchResult(value: unknown): value is OWOXSearchResult {
  return (
    isRecord(value) &&
    typeof value.entityType === 'string' &&
    SEARCH_ENTITY_TYPES.has(value.entityType as OWOXSearchEntityType) &&
    typeof value.entityId === 'string' &&
    typeof value.title === 'string' &&
    (typeof value.description === 'string' || value.description === null) &&
    typeof value.finalScore === 'number' &&
    typeof value.kwScore === 'number' &&
    (typeof value.vecScore === 'number' || value.vecScore === null)
  );
}

function parseSearchResults(response: unknown): OWOXSearchResult[] {
  if (!Array.isArray(response) || !response.every(isSearchResult)) {
    throw new OWOXApiError('OWOX Search API returned an unexpected response shape', {
      details: response,
    });
  }

  return response;
}

export class SearchApi {
  constructor(private readonly requester: SearchRequester) {}

  async query(query: string, options: OWOXSearchOptions = {}): Promise<OWOXSearchResult[]> {
    const queryParams = {
      q: query,
      ...(options.limit === undefined ? {} : { limit: String(options.limit) }),
      ...(options.entityTypes?.length ? { entityTypes: options.entityTypes.join(',') } : {}),
      ...(options.excludeDrafts === undefined
        ? {}
        : { excludeDrafts: String(options.excludeDrafts) }),
    };

    return parseSearchResults(await this.requester.getJson<unknown>('/api/search', queryParams));
  }
}
