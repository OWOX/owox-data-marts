import { OWOXApiClient, OWOXApiError } from './index.js';

type RecordedRequest = {
  method: string;
  url: string;
  body: unknown;
};

const apiOrigin = 'https://example.test';
const apiKeyId = 'pmk_AbCdEfGhIjKlMnOpQrStUv';
const apiKey = `owox_key_${Buffer.from(
  JSON.stringify({ apiOrigin, apiKeyId, apiKeySecret: 'secret-value-that-must-not-leak' }),
  'utf8'
).toString('base64url')}`;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const publication = {
  publicationId: 'pub1',
  pluginId: 'p1',
  repository: 'OWOX/example',
  scope: 'deployment',
  isActive: true,
  allProjects: true,
  audienceProjectIds: [],
  currentSemver: '1.0.0',
  diagnostics: {
    deliveryUrl: 'https://plugin.example.com',
    commitSha: 'abc',
    accessMode: 'anonymous',
    syncedAt: '2026-07-01T00:00:00.000Z',
    acceptedSemvers: ['1.0.0'],
    unchangedSemvers: [],
    rejections: [],
  },
};

function createClient(handler: (request: RecordedRequest) => Response) {
  const recorded: RecordedRequest[] = [];

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const parsedUrl = new URL(request.url);
    const bodyText = await request.text();
    const record: RecordedRequest = {
      method: request.method,
      url: `${parsedUrl.pathname}${parsedUrl.search}`,
      body: bodyText ? JSON.parse(bodyText) : undefined,
    };

    if (record.method === 'POST' && record.url === '/api/auth/api-keys/exchange') {
      return json(200, { accessToken: 'access-token-1' });
    }

    recorded.push(record);
    return handler(record);
  }) as typeof fetch;

  return { client: new OWOXApiClient({ apiKey, fetchImpl }), recorded };
}

describe('Plugins API', () => {
  it('publishes against the publications collection', async () => {
    const { client, recorded } = createClient(() => json(200, publication));

    await client.plugins.publish({
      repository: 'OWOX/example',
      scope: 'deployment',
      allProjects: true,
    });

    expect(recorded[0]).toMatchObject({
      method: 'POST',
      url: '/api/plugins/publications',
      body: { repository: 'OWOX/example', scope: 'deployment', allProjects: true },
    });
  });

  // Unpublish carries a body -- the deployment audience form needs one -- so it is a
  // POST to its own path rather than a DELETE.
  it('unpublishes through a dedicated path', async () => {
    const { client, recorded } = createClient(() => json(200, publication));

    await client.plugins.unpublish({
      repository: 'OWOX/example',
      scope: 'deployment',
      projectIds: ['j1'],
    });

    expect(recorded[0]).toMatchObject({
      method: 'POST',
      url: '/api/plugins/publications/unpublish',
      body: { projectIds: ['j1'] },
    });
  });

  // Project and member identity come from the authenticated context server-side, so
  // there is deliberately no way to name a target here.
  it('sends no target project or member', async () => {
    const { client, recorded } = createClient(() => json(200, publication));

    await client.plugins.publish({ repository: 'OWOX/example', scope: 'project' });

    expect(Object.keys(recorded[0]!.body as object)).toEqual(['repository', 'scope']);
  });

  it('passes the scope as a query parameter when listing', async () => {
    const { client, recorded } = createClient(() => json(200, [publication]));

    await client.plugins.listPublications('member');

    expect(recorded[0]).toMatchObject({
      method: 'GET',
      url: '/api/plugins/publications?scope=member',
    });
  });

  it('suspends and resumes with an optional note', async () => {
    const { client, recorded } = createClient(() =>
      json(200, { pluginId: 'p1', suspended: true, note: 'why' })
    );

    await client.plugins.suspend('OWOX/example', 'why');
    await client.plugins.resume('OWOX/example');

    expect(recorded[0]).toMatchObject({
      url: '/api/plugins/suspend',
      body: { repository: 'OWOX/example', note: 'why' },
    });
    expect(recorded[1]).toMatchObject({ url: '/api/plugins/resume' });
  });

  it('updates by repository (CLI form of Check now)', async () => {
    const { client, recorded } = createClient(() =>
      json(200, {
        pluginId: 'p1',
        repository: 'OWOX/example',
        currentVersionId: 'v2',
        currentSemver: '2.0.0',
        updated: true,
        diagnostics: null,
      })
    );

    await client.plugins.update('OWOX/example');

    expect(recorded[0]).toMatchObject({
      method: 'POST',
      url: '/api/plugins/update',
      body: { repository: 'OWOX/example' },
    });
  });

  describe('failures', () => {
    it('rejects a response that is not a publication', async () => {
      const { client } = createClient(() => json(200, { unexpected: true }));

      await expect(
        client.plugins.publish({ repository: 'OWOX/example', scope: 'member' })
      ).rejects.toBeInstanceOf(OWOXApiError);
    });

    it('rejects a listing that is not an array', async () => {
      const { client } = createClient(() => json(200, { nope: true }));

      await expect(client.plugins.listPublications('deployment')).rejects.toBeInstanceOf(
        OWOXApiError
      );
    });

    // The CLI prints installationUrl from here, so it has to survive the round trip.
    it('carries the error code and details from the backend envelope', async () => {
      const { client } = createClient(() =>
        json(400, {
          statusCode: 400,
          message: 'OWOX cannot read OWOX/example',
          code: 'GITHUB_REPO_NOT_ACCESSIBLE',
          errorDetails: { installationUrl: 'https://github.com/apps/owox/installations/new' },
        })
      );

      await expect(
        client.plugins.publish({
          repository: 'OWOX/example',
          scope: 'deployment',
          allProjects: true,
        })
      ).rejects.toMatchObject({
        code: 'GITHUB_REPO_NOT_ACCESSIBLE',
        details: { installationUrl: 'https://github.com/apps/owox/installations/new' },
      });
    });
  });
});
