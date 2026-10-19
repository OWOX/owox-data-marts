import { OWOXApiClient } from './index.js';

const apiKey = `owox_key_${Buffer.from(
  JSON.stringify({
    apiOrigin: 'https://example.test',
    apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    apiKeySecret: 'test-secret',
  })
).toString('base64url')}`;

function createClient(settings: unknown, updateStatus = 200) {
  const updates: unknown[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === '/api/auth/api-keys/exchange') {
      return Response.json({ accessToken: 'access-token' });
    }
    if (request.method === 'PUT') {
      updates.push(await request.json());
      return Response.json(settings, { status: updateStatus });
    }
    return Response.json(settings);
  };
  return { client: new OWOXApiClient({ apiKey, fetchImpl }), updates };
}

describe('Project description revisions', () => {
  it('retains the authoritative revision, including an unsaved project revision', async () => {
    const { client } = createClient({ description: null, revision: 0 });
    await expect(client.project.getSettings()).resolves.toEqual({
      description: null,
      revision: 0,
    });
  });

  it('keeps older deployments readable without inventing a usable revision', async () => {
    const { client } = createClient({ description: 'Existing' });
    await expect(client.project.getSettings()).resolves.toEqual({ description: 'Existing' });
  });

  it.each([null, -1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid returned revision: %p',
    async revision => {
      const { client } = createClient({ description: 'Existing', revision });
      await expect(client.project.getSettings()).rejects.toMatchObject({ name: 'OWOXApiError' });
    }
  );

  it('sends a conditional clear and returns the saved revision', async () => {
    const { client, updates } = createClient({ description: null, revision: 4 });
    await expect(client.project.updateDescription(null, { expectedRevision: 3 })).resolves.toEqual({
      description: null,
      revision: 4,
    });
    expect(updates).toEqual([{ description: null, expectedRevision: 3 }]);
  });

  it('preserves the unconditional request when no precondition is provided', async () => {
    const { client, updates } = createClient({ description: 'New', revision: 4 });
    await client.project.updateDescription('New');
    expect(updates).toEqual([{ description: 'New' }]);
  });

  it('surfaces a stale-write conflict without retrying or dropping the precondition', async () => {
    const { client, updates } = createClient({ message: 'Description changed' }, 409);
    await expect(
      client.project.updateDescription('New', { expectedRevision: 3 })
    ).rejects.toMatchObject({ name: 'OWOXApiError', status: 409 });
    expect(updates).toEqual([{ description: 'New', expectedRevision: 3 }]);
  });

  it.each([-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid precondition before sending a request: %p',
    async expectedRevision => {
      const { client, updates } = createClient({ description: null, revision: 1 });
      await expect(client.project.updateDescription(null, { expectedRevision })).rejects.toThrow();
      expect(updates).toEqual([]);
    }
  );
});
