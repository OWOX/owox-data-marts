import { Buffer } from 'node:buffer';

import { OWOXApiError } from './errors.js';

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
  limit?: number;
};

type DataMartsPage = {
  items: OWOXDataMart[];
  total: number;
  nextOffset: number | null;
};

export type JsonRequester = {
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>;
  getStream(path: string, query?: URLSearchParams): Promise<Response>;
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
  if (options.limit !== undefined) {
    query.append('limit', String(options.limit));
  }

  return query.size === 0 ? undefined : query;
}

function withDataMartContext(error: OWOXApiError, dataMartId: string): OWOXApiError {
  const details = isRecord(error.details)
    ? { dataMartId, ...error.details }
    : {
        dataMartId,
        ...(error.details === undefined ? {} : { details: error.details }),
      };

  return new OWOXApiError(error.message, {
    status: error.status,
    code: error.code,
    details,
    cause: error,
  });
}

export class DataMartDataTraversal {
  readonly runId: string | undefined;
  private consumed = false;

  constructor(
    private readonly response: Response,
    private readonly dataMartId: string
  ) {
    this.runId = response.headers.get('x-owox-run-id') ?? undefined;
  }

  async *rowChunks(): AsyncIterable<OWOXDataMartRow[]> {
    if (this.consumed) {
      throw new OWOXApiError('OWOX Data Mart data stream can only be traversed once', {
        details: this.contextDetails(),
      });
    }
    this.consumed = true;

    if (!this.response.body) {
      throw new OWOXApiError('OWOX Data Mart data stream response did not include a body', {
        details: this.contextDetails(),
      });
    }

    const reader = this.response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let lineNumber = 0;
    let streamEnded = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        streamEnded = done;
        pending += decoder.decode(value, { stream: !done });

        const lines = pending.split('\n');
        pending = lines.pop() ?? '';

        const rows: OWOXDataMartRow[] = [];
        for (const line of lines) {
          if (line.length === 0) {
            continue;
          }
          lineNumber += 1;
          rows.push(this.parseLine(line, lineNumber));
        }

        if (rows.length > 0) {
          yield rows;
        }

        if (done) {
          break;
        }
      }

      if (pending.length > 0) {
        lineNumber += 1;
        yield [this.parseLine(pending, lineNumber)];
      }
    } catch (error) {
      if (error instanceof OWOXApiError) {
        throw error;
      }

      throw new OWOXApiError('Failed to read OWOX Data Mart data stream', {
        details: this.contextDetails(),
        cause: error,
      });
    } finally {
      if (!streamEnded) {
        await reader.cancel().catch(() => undefined);
      }
      reader.releaseLock();
    }
  }

  private parseLine(line: string, lineNumber: number): OWOXDataMartRow {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new OWOXApiError(`Malformed NDJSON line ${lineNumber} in OWOX Data Mart data stream`, {
        details: {
          ...this.contextDetails(),
          lineNumber,
          linePreview: line.slice(0, 200),
        },
        cause: error,
      });
    }

    if (!isRecord(parsed)) {
      throw new OWOXApiError(`NDJSON line ${lineNumber} is not a JSON object`, {
        details: {
          ...this.contextDetails(),
          lineNumber,
        },
      });
    }

    return parsed;
  }

  private contextDetails(): Record<string, string> {
    return {
      dataMartId: this.dataMartId,
      ...(this.runId ? { runId: this.runId } : {}),
    };
  }
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

  async traverseData(
    dataMartId: string,
    options: TraverseDataOptions = {}
  ): Promise<DataMartDataTraversal> {
    const query = buildTraverseDataQuery(options);
    let response: Response;
    try {
      response = await this.requester.getStream(
        `/api/external/http-data/data-marts/${encodeURIComponent(dataMartId)}.ndjson`,
        query
      );
    } catch (error) {
      if (error instanceof OWOXApiError) {
        throw withDataMartContext(error, dataMartId);
      }

      throw new OWOXApiError('Failed to open OWOX Data Mart data stream', {
        details: { dataMartId },
        cause: error,
      });
    }

    return new DataMartDataTraversal(response, dataMartId);
  }
}
