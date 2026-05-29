import { OWOXApiError } from './errors.js';

export type OWOXDataMart = Record<string, unknown> & {
  id: string;
  title: string;
};

type DataMartsPage = {
  items: OWOXDataMart[];
  total: number;
  nextOffset: number | null;
};

export type JsonRequester = {
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
}
