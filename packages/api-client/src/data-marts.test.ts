import { OWOXApiClient, OWOXApiError } from './index.js';

type RecordedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

type FetchMock = {
  fetchImpl: typeof fetch;
  requests: RecordedRequest[];
};

const apiOrigin = 'https://example.test';

function createJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function createNdjsonResponse(chunks: string[], headers: Record<string, string> = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson',
      ...headers,
    },
  });
}

function createOpenNdjsonResponse(chunk: string, onCancel: () => void): Response {
  const encoder = new TextEncoder();
  let pulled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!pulled) {
        pulled = true;
        controller.enqueue(encoder.encode(chunk));
      }
    },
    cancel() {
      onCancel();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson',
    },
  });
}

async function readRequestBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) {
    return undefined;
  }

  return JSON.parse(text);
}

function createFetchMock(
  handler: (request: RecordedRequest) => Response | Promise<Response>
): FetchMock {
  const requests: RecordedRequest[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const parsedUrl = new URL(request.url);
    const recordedRequest: RecordedRequest = {
      method: request.method,
      url: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers,
      body: await readRequestBody(request),
    };
    requests.push(recordedRequest);

    return handler(recordedRequest);
  };

  return { fetchImpl: fetchImpl as typeof fetch, requests };
}

async function collectRows(data: {
  rowChunks(): AsyncIterable<Record<string, unknown>[]>;
}): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for await (const chunk of data.rowChunks()) {
    rows.push(...chunk);
  }
  return rows;
}

describe('DataMartsApi.traverseData', () => {
  const apiKeyId = 'pmk_AbCdEfGhIjKlMnOpQrStUv';
  const apiKeySecret = 'secret-value-that-must-not-leak';

  it('requests the NDJSON endpoint and exposes incremental row chunks with run metadata', async () => {
    const filter = [{ column: 'Event Date (local)', operator: 'gte', value: '2026-01-01' }];
    const sort = [{ column: 'Revenue: net = USD', direction: 'desc' }];
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (
        request.method === 'GET' &&
        request.url.startsWith('/api/external/http-data/data-marts/dm%20123.ndjson')
      ) {
        expect(request.headers.accept).toBe('application/x-ndjson');
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        return createNdjsonResponse(['{"date":"2026-05-01"}\n', '{"date":"2026-05-02"}\n'], {
          'x-owox-run-id': 'run-1',
        });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    const data = await client.dataMarts.traverseData('dm 123', {
      columns: '*',
      column: ['Revenue: net = USD', '*'],
      filter,
      sort,
      limit: 2,
    });

    expect(data.runId).toBe('run-1');
    await expect(collectRows(data)).resolves.toEqual([
      { date: '2026-05-01' },
      { date: '2026-05-02' },
    ]);

    const request = fetchMock.requests.find(({ method }) => method === 'GET');
    expect(request).toBeDefined();
    const url = new URL(`${apiOrigin}${request?.url}`);
    expect(url.pathname).toBe('/api/external/http-data/data-marts/dm%20123.ndjson');
    expect(url.searchParams.get('columns')).toBe('*');
    expect(url.searchParams.getAll('column')).toEqual(['Revenue: net = USD', '*']);
    expect(url.searchParams.get('limit')).toBe('2');
    expect(
      JSON.parse(Buffer.from(url.searchParams.get('filter')!, 'base64url').toString('utf8'))
    ).toEqual(filter);
    expect(
      JSON.parse(Buffer.from(url.searchParams.get('sort')!, 'base64url').toString('utf8'))
    ).toEqual(sort);
  });

  it('reports malformed NDJSON lines with line and run context', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (
        request.method === 'GET' &&
        request.url === '/api/external/http-data/data-marts/dm-1.ndjson'
      ) {
        return createNdjsonResponse(['{"date":"2026-05-01"}\n', '{bad json}\n'], {
          'x-owox-run-id': 'run-bad',
        });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    const data = await client.dataMarts.traverseData('dm-1');

    const rows = collectRows(data);
    await expect(rows).rejects.toBeInstanceOf(OWOXApiError);
    await expect(rows).rejects.toMatchObject({
      name: 'OWOXApiError',
      details: {
        dataMartId: 'dm-1',
        lineNumber: 2,
        runId: 'run-bad',
      },
    });
  });

  it('cancels the NDJSON response body when traversal stops early', async () => {
    let wasCancelled = false;
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (
        request.method === 'GET' &&
        request.url === '/api/external/http-data/data-marts/dm-1.ndjson'
      ) {
        return createOpenNdjsonResponse('{"date":"2026-05-01"}\n', () => {
          wasCancelled = true;
        });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    const data = await client.dataMarts.traverseData('dm-1');

    for await (const rows of data.rowChunks()) {
      expect(rows).toEqual([{ date: '2026-05-01' }]);
      break;
    }

    expect(wasCancelled).toBe(true);
  });

  it('wraps network failures while opening the stream with data mart context', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (
        request.method === 'GET' &&
        request.url === '/api/external/http-data/data-marts/dm-1.ndjson'
      ) {
        throw new TypeError('network disconnected');
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    const data = client.dataMarts.traverseData('dm-1');
    await expect(data).rejects.toBeInstanceOf(OWOXApiError);
    await expect(data).rejects.toMatchObject({
      details: { dataMartId: 'dm-1' },
    });
  });

  it('rejects columns="**" combined with exact column names before making a request', async () => {
    const fetchMock = createFetchMock(() => createJsonResponse(500, { message: 'unexpected' }));
    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(
      client.dataMarts.traverseData('dm-1', { columns: '**', column: ['date'] })
    ).rejects.toThrow('columns "**" cannot be combined with exact column values');
    expect(fetchMock.requests).toHaveLength(0);
  });
});
