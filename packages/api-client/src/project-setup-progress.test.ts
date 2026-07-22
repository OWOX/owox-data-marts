import { OWOXApiClient, OWOXApiError } from './index.js';

type RecordedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
};

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

function createFetchMock(handler: (request: RecordedRequest) => Response): typeof fetch {
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
    });
  }) as typeof fetch;
}

const setupProgress = {
  version: 1,
  stepsSchemaVersion: 1,
  progress: 40,
  steps: {
    hasStorage: { done: true, completedAt: '2026-07-21T12:00:00.000Z' },
    hasDraftDataMart: { done: true, completedAt: '2026-07-21T12:01:00.000Z' },
    hasPublishedDataMart: { done: true, completedAt: '2026-07-21T12:02:00.000Z' },
    hasDestination: { done: true, completedAt: '2026-07-21T12:03:00.000Z' },
    hasReport: { done: false, completedAt: null },
    hasReportRun: { done: false, completedAt: null },
    hasTeammatesInvited: { done: false, completedAt: null },
    hasGoogleSheetsDestination: { done: false, completedAt: null },
    hasGoogleSheetsExtension: { done: false, completedAt: null },
    hasGoogleSheetsReportRun: { done: false, completedAt: null },
  },
};

describe('Project setup progress API', () => {
  it('gets merged setup progress through an authenticated request', async () => {
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (request.method === 'GET' && request.url === '/api/project-setup-progress') {
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        expect(request.headers['x-owox-api-key-id']).toBe(apiKeyId);
        return createJsonResponse(200, setupProgress);
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.project.getSetupProgress()).resolves.toEqual(setupProgress);
  });

  it.each([
    [
      'an invalid nested step',
      {
        ...setupProgress,
        steps: {
          ...setupProgress.steps,
          hasStorage: { done: 'yes', completedAt: null },
        },
      },
    ],
    ['an out-of-range progress percentage', { ...setupProgress, progress: 101 }],
    ['a fractional API contract version', { ...setupProgress, version: 1.5 }],
    ['a non-positive steps schema version', { ...setupProgress, stepsSchemaVersion: 0 }],
  ])('rejects a response with %s', async (_label, response) => {
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    const result = client.project.getSetupProgress();
    await expect(result).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Project Setup Progress API returned an unexpected response shape',
      details: response,
    });
    await expect(result).rejects.toBeInstanceOf(OWOXApiError);
  });
});
