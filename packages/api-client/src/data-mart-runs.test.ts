import {
  OWOXApiClient,
  OWOXApiError,
  type OWOXDataMartRun,
  type OWOXDataMartRunDetail,
  type OWOXDataMartRunStartOptions,
  type OWOXDataQualityRule,
} from './index.js';
import { jest } from '@jest/globals';

type RecordedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

// @ts-expect-error connector data requires an explicit MANUAL_BACKFILL run type
const invalidImplicitBackfill: OWOXDataMartRunStartOptions = { data: { StartDate: '2026-07-01' } };
void invalidImplicitBackfill;

const apiOrigin = 'https://example.test';
const apiKeyId = 'pmk_AbCdEfGhIjKlMnOpQrStUv';
const apiKey = `owox_key_${Buffer.from(
  JSON.stringify({
    apiOrigin,
    apiKeyId,
    apiKeySecret: 'secret-value-that-must-not-leak',
  }),
  'utf8'
).toString('base64url')}`;

function createJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function readRequestBody(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : undefined;
}

function createFetchMock(
  handler: (request: RecordedRequest) => Response | Promise<Response>
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const parsedUrl = new URL(request.url);
    return handler({
      method: request.method,
      url: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers,
      body: await readRequestBody(request),
    });
  }) as typeof fetch;
}

const run: OWOXDataMartRun = {
  id: 'run-1',
  status: 'SUCCESS',
  type: 'CONNECTOR',
  runType: 'manual',
  dataMartId: 'data-mart-1',
  definitionRun: { type: 'connector' },
  reportId: null,
  reportDefinition: null,
  insightId: null,
  insightDefinition: null,
  insightTemplateId: null,
  insightTemplateDefinition: null,
  aiSourceDefinition: null,
  logs: [],
  errors: null,
  createdAt: '2026-08-07T08:00:00.000Z',
  startedAt: '2026-08-07T08:00:01.000Z',
  finishedAt: '2026-08-07T08:01:00.000Z',
  createdByUser: null,
  additionalParams: null,
  totals: null,
  qualitySummary: null,
};

const runDetail: OWOXDataMartRunDetail = { ...run, dataQuality: null };

const dataQualityRule: OWOXDataQualityRule = {
  key: 'null_rate:field:["email"]',
  category: 'null_rate',
  scope: { type: 'FIELD', fieldPath: ['email'] },
  severity: 'warning',
  enabled: true,
  parameters: { thresholdPercent: 0 },
  isApplicable: true,
};

const dataQualityDetail = {
  snapshot: {
    config: { rules: [dataQualityRule] },
    schema: null,
    relationships: [],
    definitionType: 'CONNECTOR',
  },
  summary: {
    state: 'PASSED',
    enabledChecks: 1,
    totalChecks: 1,
    passedChecks: 1,
    failedChecks: 0,
    notApplicableChecks: 0,
    errorChecks: 0,
    noticeFindings: 0,
    warningFindings: 0,
    errorFindings: 0,
    violationCount: 0,
    highestSeverity: null,
  },
  results: [],
} as const;

describe('Data Mart run lifecycle API', () => {
  it('starts, lists, reads, and cancels a Data Mart run through authenticated requests', async () => {
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
      expect(request.headers['x-owox-api-key-id']).toBe(apiKeyId);

      if (request.method === 'POST' && request.url === '/api/data-marts/data%20mart/manual-run') {
        expect(request.body).toEqual({
          payload: {
            runType: 'MANUAL_BACKFILL',
            data: { StartDate: '2026-07-01', EndDate: '2026-07-31' },
          },
        });
        return createJsonResponse(201, { runId: '123e4567-e89b-12d3-a456-426614174000' });
      }
      if (
        request.method === 'GET' &&
        request.url === '/api/data-marts/data%20mart/runs?limit=25&offset=50'
      ) {
        return createJsonResponse(200, { runs: [run] });
      }
      if (request.method === 'GET' && request.url === '/api/data-marts/data%20mart/runs/run%3A1') {
        return createJsonResponse(200, runDetail);
      }
      if (
        request.method === 'POST' &&
        request.url === '/api/data-marts/data%20mart/runs/run%3A1/cancel'
      ) {
        expect(request.body).toBeUndefined();
        return new Response(null, { status: 204 });
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });
    const dataMartRuns = client.runs.forDataMart('data mart');

    await expect(
      dataMartRuns.start({
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-07-01', EndDate: '2026-07-31' },
      })
    ).resolves.toEqual({ runId: '123e4567-e89b-12d3-a456-426614174000' });
    await expect(dataMartRuns.list({ limit: 25, offset: 50 })).resolves.toEqual({ runs: [run] });
    await expect(dataMartRuns.get('run:1')).resolves.toEqual(runDetail);
    await expect(dataMartRuns.cancel('run:1')).resolves.toBeUndefined();
  });

  it('rejects malformed manual-run and run-history responses', async () => {
    const fetchImpl = createFetchMock(request => {
      if (request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (request.method === 'POST') {
        return createJsonResponse(201, { runId: 42 });
      }
      return createJsonResponse(200, { runs: [{ ...run, status: 'UNKNOWN' }] });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.forDataMart('dm-1').start()).rejects.toBeInstanceOf(OWOXApiError);
    await expect(client.runs.forDataMart('dm-1').list()).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Data Mart Runs API returned an unexpected response shape',
    });
  });

  it('normalizes run responses from deployments that predate Data Quality fields', async () => {
    const { qualitySummary: _qualitySummary, ...legacyRun } = run;
    const {
      qualitySummary: _detailQualitySummary,
      dataQuality: _dataQuality,
      ...legacyRunDetail
    } = runDetail;
    const fetchImpl = createFetchMock(request => {
      if (request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (request.url === '/api/data-marts/dm-1/runs/run-1') {
        return createJsonResponse(200, legacyRunDetail);
      }
      return createJsonResponse(200, { runs: [legacyRun] });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });
    const runs = client.runs.forDataMart('dm-1');

    await expect(runs.list()).resolves.toEqual({ runs: [{ ...legacyRun, qualitySummary: null }] });
    await expect(runs.get('run-1')).resolves.toEqual({
      ...legacyRunDetail,
      qualitySummary: null,
      dataQuality: null,
    });
  });

  it('accepts a manual backfill without connector-specific fields', async () => {
    const options = { runType: 'MANUAL_BACKFILL' } as const;
    const fetchImpl = createFetchMock(request => {
      if (request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      expect(request.body).toEqual({ payload: options });
      return createJsonResponse(201, { runId: '123e4567-e89b-12d3-a456-426614174000' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.forDataMart('dm-1').start(options)).resolves.toEqual({
      runId: '123e4567-e89b-12d3-a456-426614174000',
    });
  });

  it.each(['status', 'type', 'runType'] as const)(
    'rejects a null %s that the backend cannot produce',
    async field => {
      const fetchImpl = createFetchMock(request => {
        if (request.url === '/api/auth/api-keys/exchange') {
          return createJsonResponse(200, { accessToken: 'access-token-1' });
        }
        return createJsonResponse(200, { ...runDetail, [field]: null });
      });
      const client = new OWOXApiClient({ apiKey, fetchImpl });

      await expect(client.runs.forDataMart('dm-1').get('run-1')).rejects.toBeInstanceOf(
        OWOXApiError
      );
    }
  );

  it('rejects invalid request options before making a network request', async () => {
    const fetchImpl = jest.fn<typeof fetch>();
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(
      client.runs.forDataMart('dm-1').start({ runType: 'FULL_REFRESH' } as never)
    ).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'Invalid OWOX Data Mart run-start options',
    });
    await expect(
      client.runs.forDataMart('dm-1').start({ data: [] } as never)
    ).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'Invalid OWOX Data Mart run-start options',
    });
    await expect(
      client.runs.forDataMart('dm-1').start({ data: { value: 'silently ignored' } } as never)
    ).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'Invalid OWOX Data Mart run-start options',
    });
    await expect(
      client.runs
        .forDataMart('dm-1')
        .start({ runType: 'INCREMENTAL', data: { value: 'silently ignored' } } as never)
    ).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'Invalid OWOX Data Mart run-start options',
    });
    await expect(
      client.runs.forDataMart('dm-1').start({
        runType: 'MANUAL_BACKFILL',
        data: { value: 'x'.repeat(1024 * 1024) },
      })
    ).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Data Mart manual-run payload exceeds 1MB',
    });
    await expect(
      client.runs.forDataMart('dm-1').list({ limit: '25' } as never)
    ).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'Invalid OWOX Data Mart run-list options',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects ambiguous Data Mart and run IDs before making a network request', async () => {
    const fetchImpl = jest.fn<typeof fetch>();
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    expect(() => client.runs.forDataMart('.')).toThrow(OWOXApiError);
    expect(() => client.runs.forDataMart('  ')).toThrow(OWOXApiError);
    expect(() => client.runs.forDataMart('data/mart')).toThrow(OWOXApiError);
    expect(() => client.runs.forDataMart('data\\mart')).toThrow(OWOXApiError);
    expect(() => client.runs.forDataMart('data%2Fmart')).toThrow(OWOXApiError);

    const runs = client.runs.forDataMart('dm-1');
    await expect(runs.get('')).rejects.toBeInstanceOf(OWOXApiError);
    await expect(runs.cancel('..')).rejects.toBeInstanceOf(OWOXApiError);
    await expect(runs.get('run/1')).rejects.toBeInstanceOf(OWOXApiError);
    await expect(runs.cancel('run\\1')).rejects.toBeInstanceOf(OWOXApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects malformed Data Quality detail instead of returning an unchecked nested object', async () => {
    const malformedDetail = {
      ...runDetail,
      dataQuality: {
        snapshot: {
          config: { rules: [] },
          schema: null,
          relationships: [],
          definitionType: 'CONNECTOR',
        },
        summary: {
          state: 'NOT_A_REAL_STATE',
          enabledChecks: 0,
          totalChecks: 0,
          passedChecks: 0,
          failedChecks: 0,
          notApplicableChecks: 0,
          errorChecks: 0,
          noticeFindings: 0,
          warningFindings: 0,
          errorFindings: 0,
          violationCount: 0,
          highestSeverity: null,
        },
        results: [],
      },
    };
    const fetchImpl = createFetchMock(request => {
      if (request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, malformedDetail);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.forDataMart('dm-1').get('run-1')).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Data Mart Run API returned an unexpected response shape',
    });
  });

  it('accepts a nested Data Quality detail that matches the backend schema', async () => {
    const response = { ...runDetail, dataQuality: dataQualityDetail };
    const fetchImpl = createFetchMock(request => {
      if (request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.forDataMart('dm-1').get('run-1')).resolves.toEqual(response);
  });

  it('accepts additive Data Quality fields and server-owned rule invariants', async () => {
    const response = {
      ...runDetail,
      dataQuality: {
        ...dataQualityDetail,
        snapshot: {
          ...dataQualityDetail.snapshot,
          config: {
            rules: [
              {
                ...dataQualityRule,
                key: 'server-defined-rule-key',
                scope: { type: 'DATA_MART', futureScopeField: true },
                parameters: { thresholdPercent: 101, futureParameter: 'supported' },
                futureRuleField: { version: 2 },
              },
            ],
          },
        },
      },
    };
    const fetchImpl = createFetchMock(request => {
      if (request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.forDataMart('dm-1').get('run-1')).resolves.toEqual(response);
  });

  it('wraps a non-object Data Quality result as an API response-shape error', async () => {
    const response = {
      ...runDetail,
      dataQuality: { ...dataQualityDetail, results: [null] },
    };
    const fetchImpl = createFetchMock(request => {
      if (request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.forDataMart('dm-1').get('run-1')).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Data Mart Run API returned an unexpected response shape',
    });
  });

  it('rejects nested Data Quality values outside the backend schema constraints', async () => {
    const invalidRules = [
      { ...dataQualityRule, scope: { type: 'FIELD', fieldPath: [] } },
      { ...dataQualityRule, scope: { type: 'FIELD', fieldPath: ['   '] } },
      { ...dataQualityRule, notApplicableReason: '' },
    ];

    for (const invalidRule of invalidRules) {
      const response = {
        ...runDetail,
        dataQuality: {
          ...dataQualityDetail,
          snapshot: {
            ...dataQualityDetail.snapshot,
            config: { rules: [invalidRule] },
          },
        },
      };
      const fetchImpl = createFetchMock(request => {
        if (request.url === '/api/auth/api-keys/exchange') {
          return createJsonResponse(200, { accessToken: 'access-token-1' });
        }
        return createJsonResponse(200, response);
      });
      const client = new OWOXApiClient({ apiKey, fetchImpl });

      await expect(client.runs.forDataMart('dm-1').get('run-1')).rejects.toBeInstanceOf(
        OWOXApiError
      );
    }
  });
});
