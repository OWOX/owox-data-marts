import { OWOXApiError, OWOXAuthError } from './errors.js';
import { ReportsApi } from './reports.js';

function streamResponse(runId: string): Response {
  return new Response('{"date":"2026-05-01"}\n', {
    headers: { 'content-type': 'application/x-ndjson', 'x-owox-run-id': runId },
  });
}

function malformedStreamResponse(runId: string): Response {
  return new Response('{"date":"2026-05-01"}\n{bad json}\n', {
    headers: { 'content-type': 'application/x-ndjson', 'x-owox-run-id': runId },
  });
}

async function collectRows(traversal: {
  rowChunks(): AsyncIterable<Record<string, unknown>[]>;
}): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for await (const chunk of traversal.rowChunks()) {
    rows.push(...chunk);
  }
  return rows;
}

describe('ReportsApi.traverseData', () => {
  it('opens the report ndjson stream with only a limit query and exposes the run id', async () => {
    const calls: Array<{ path: string; query?: URLSearchParams }> = [];
    const requester = {
      getJson: async () => ({}) as never,
      getStream: async (path: string, query?: URLSearchParams) => {
        calls.push({ path, query });
        return streamResponse('run-9');
      },
    };
    const api = new ReportsApi(requester);

    const traversal = await api.traverseData('report-1', { limit: 5 });

    expect(calls[0].path).toBe('/api/external/http-data/reports/report-1.ndjson');
    expect(calls[0].query?.get('limit')).toBe('5');
    expect(traversal.runId).toBe('run-9');
  });

  it('omits the query when no limit is given', async () => {
    const calls: Array<{ query?: URLSearchParams }> = [];
    const requester = {
      getJson: async () => ({}) as never,
      getStream: async (_path: string, query?: URLSearchParams) => {
        calls.push({ query });
        return streamResponse('run-1');
      },
    };
    await new ReportsApi(requester).traverseData('report-1');
    expect(calls[0].query).toBeUndefined();
  });

  it('adds report context to an OWOXApiError raised while opening the stream', async () => {
    const requester = {
      getJson: async () => ({}) as never,
      getStream: async () => {
        throw new OWOXApiError('boom', { status: 500, code: 'BOOM' });
      },
    };

    const data = new ReportsApi(requester).traverseData('report-1');
    await expect(data).rejects.toBeInstanceOf(OWOXApiError);
    await expect(data).rejects.toMatchObject({
      name: 'OWOXApiError',
      status: 500,
      code: 'BOOM',
      details: { reportId: 'report-1' },
    });
  });

  it('preserves auth errors while opening the stream with report context', async () => {
    const requester = {
      getJson: async () => ({}) as never,
      getStream: async () => {
        throw new OWOXAuthError('Unauthorized', { status: 401, code: 'INVALID_API_KEY' });
      },
    };

    const data = new ReportsApi(requester).traverseData('report-1');
    await expect(data).rejects.toBeInstanceOf(OWOXAuthError);
    await expect(data).rejects.toMatchObject({
      name: 'OWOXAuthError',
      status: 401,
      code: 'INVALID_API_KEY',
      details: { reportId: 'report-1' },
    });
  });

  it('wraps non-OWOX failures while opening the stream with report context', async () => {
    const requester = {
      getJson: async () => ({}) as never,
      getStream: async () => {
        throw new TypeError('network disconnected');
      },
    };

    const data = new ReportsApi(requester).traverseData('report-1');
    await expect(data).rejects.toBeInstanceOf(OWOXApiError);
    await expect(data).rejects.toMatchObject({
      message: 'Failed to open OWOX report data stream',
      details: { reportId: 'report-1' },
      cause: expect.any(TypeError),
    });
  });

  it('rejects traversing the report data stream a second time', async () => {
    const requester = {
      getJson: async () => ({}) as never,
      getStream: async () => streamResponse('run-1'),
    };

    const traversal = await new ReportsApi(requester).traverseData('report-1');
    await collectRows(traversal);

    const rows = collectRows(traversal);
    await expect(rows).rejects.toBeInstanceOf(OWOXApiError);
    await expect(rows).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX report data stream can only be traversed once',
      details: {
        reportId: 'report-1',
        runId: 'run-1',
      },
    });
  });

  it('reports malformed NDJSON lines with report and run context', async () => {
    const requester = {
      getJson: async () => ({}) as never,
      getStream: async () => malformedStreamResponse('run-bad'),
    };

    const traversal = await new ReportsApi(requester).traverseData('report-1');

    const rows = collectRows(traversal);
    await expect(rows).rejects.toBeInstanceOf(OWOXApiError);
    await expect(rows).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'Malformed NDJSON line 2 in OWOX report data stream',
      details: {
        reportId: 'report-1',
        lineNumber: 2,
        runId: 'run-bad',
      },
    });
  });
});
