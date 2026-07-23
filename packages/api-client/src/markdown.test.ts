import {
  OWOXApiClient,
  OWOXApiError,
  type OWOXMarkdownParseRequest,
  type OWOXMarkdownParseResponse,
} from './index.js';

type RecordedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
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
    const bodyText = await request.text();
    return handler({
      method: request.method,
      url: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers,
      body: bodyText ? JSON.parse(bodyText) : undefined,
    });
  }) as typeof fetch;
}

describe('Markdown API', () => {
  it('converts Markdown through an authenticated request and returns raw HTML', async () => {
    const input: OWOXMarkdownParseRequest = { markdown: '# Revenue' };
    const rendered: OWOXMarkdownParseResponse = '<div class="markdown-body"><h1>Revenue</h1></div>';
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (request.method === 'POST' && request.url === '/api/markdown/parse-to-html') {
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        expect(request.headers['x-owox-api-key-id']).toBe(apiKeyId);
        expect(request.headers.accept).toBe('text/html');
        expect(request.headers['content-type']).toBe('application/json');
        expect(request.body).toEqual(input);
        return new Response(rendered, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.markdown.parseToHtml(input)).resolves.toBe(rendered);
  });

  it('rejects an unexpected Markdown conversion response shape', async () => {
    const response = { html: '<p>Revenue</p>' };
    const fetchImpl = createFetchMock(request => {
      if (request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    const result = client.markdown.parseToHtml({ markdown: 'Revenue' });
    await expect(result).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Markdown API returned an unexpected response shape',
      details: response,
    });
    await expect(result).rejects.toBeInstanceOf(OWOXApiError);
  });
});
