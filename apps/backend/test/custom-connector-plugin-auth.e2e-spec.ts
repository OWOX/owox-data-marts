import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp } from '@owox/test-utils';
import { IdpProviderService } from '../src/idp/services/idp-provider.service';
import { PLUGIN_RUNTIME_AUTHORIZER } from '../src/idp/ports/plugin-runtime-authorizer.port';

const MEMBER_TOKEN = 'member-token';
const PLUGIN_TOKEN = 'plugin-token';

const MANIFEST = {
  version: '1.0',
  name: 'PluginAuthProbe',
  baseUrl: 'https://api.example.com',
  parameters: { Token: { requiredType: 'string', isRequired: true, label: 'API Token' } },
  nodes: {
    items: {
      fields: { id: { type: 'string' } },
      uniqueKeys: ['id'],
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: [] },
    },
  },
};

/**
 * A custom connector manifest is code: publishing one makes it executable server-side in a
 * spawned Node process on the next run. The plugin guard is default-allow -- it admits a
 * plugin runtime token anywhere that does not refuse it -- so without @RejectPluginAuth an
 * installed third-party page bridging through `ctx.owox` can author and activate that
 * manifest on an editor's behalf.
 *
 * Driven as real HTTP against the real guard rather than asserted off the source: the
 * decorator is only worth anything if the guard actually refuses the request.
 */
describe('Custom Connectors reject a plugin runtime token (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let definitionId: string;

  // Resolves for every installation on purpose. The refusal under test must come from the
  // endpoint declining plugin authority outright, not from this installation being inactive.
  const assertActiveInstallation = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    // Both flows carry the editor role, so an insufficient-role denial can never be the
    // reason a request is refused -- @RejectPluginAuth is the only thing left that can be.
    const payload = (token: string) => ({
      userId: 'user-1',
      projectId: 'project-1',
      roles: ['editor'],
      ...(token === PLUGIN_TOKEN
        ? { authFlow: 'plugin', pluginId: 'plugin-1', installationId: 'installation-1' }
        : { authFlow: 'app_owox' }),
    });
    const idpProvider = {
      getProvider: () => ({
        introspectToken: async (token: string) => payload(token),
        parseToken: async (token: string) => payload(token),
      }),
    };

    const testApp = await createTestApp([
      { provide: IdpProviderService, useValue: idpProvider },
      { provide: PLUGIN_RUNTIME_AUTHORIZER, useValue: { assertActiveInstallation } },
    ]);
    app = testApp.app;
    agent = testApp.agent;

    const created = await agent
      .post('/api/connectors/custom')
      .set('x-owox-authorization', MEMBER_TOKEN)
      .send({ name: 'PluginAuthProbe', title: 'Plugin Auth Probe', manifest: MANIFEST });
    expect(created.status).toBe(201);
    definitionId = created.body.id as string;
    expect(definitionId).toBeTruthy();
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  // Every route that authors, activates or removes a manifest. Built lazily so each case
  // reads `definitionId` at run time rather than at collection time.
  const mutatingRoutes: Array<[string, () => supertest.Test]> = [
    [
      'POST /connectors/custom',
      () =>
        agent
          .post('/api/connectors/custom')
          .send({ name: 'AuthoredByPlugin', title: 'Authored by plugin', manifest: MANIFEST }),
    ],
    [
      'PUT /connectors/custom/:id/draft',
      () => agent.put(`/api/connectors/custom/${definitionId}/draft`).send({ manifest: MANIFEST }),
    ],
    [
      'POST /connectors/custom/:id/publish',
      () => agent.post(`/api/connectors/custom/${definitionId}/publish`),
    ],
    [
      'POST /connectors/custom/:id/versions/:version/activate',
      () => agent.post(`/api/connectors/custom/${definitionId}/versions/1/activate`),
    ],
    ['DELETE /connectors/custom/:id', () => agent.delete(`/api/connectors/custom/${definitionId}`)],
    [
      'POST /connectors/custom/test',
      () =>
        agent
          .post('/api/connectors/custom/test')
          .send({ manifest: MANIFEST, node: 'items', configuration: { Token: 'x' } }),
    ],
  ];

  it.each(mutatingRoutes)('%s refuses a plugin runtime token', async (_route, send) => {
    const response = await send().set('x-owox-authorization', PLUGIN_TOKEN);

    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).toContain(
      'Plugin runtime authentication is not allowed for this endpoint'
    );
  });

  // The decorator sits on the class, so the reads decline plugin authority too. Nothing
  // outside the first-party builder UI calls this API, so there is no plugin page to break.
  it('refuses a plugin runtime token on the reads as well', async () => {
    const list = await agent
      .get('/api/connectors/custom')
      .set('x-owox-authorization', PLUGIN_TOKEN);
    expect(list.status).toBe(403);

    const one = await agent
      .get(`/api/connectors/custom/${definitionId}`)
      .set('x-owox-authorization', PLUGIN_TOKEN);
    expect(one.status).toBe(403);
  });

  // The counterpart that keeps the refusal honest: the same routes still work for the
  // member session, so the tests above are measuring the auth flow and not a broken route.
  // Works on its own definition so no earlier case can decide the outcome.
  it('still serves the member session that owns the connector', async () => {
    const name = `MemberOwned${Date.now()}`;
    const created = await agent
      .post('/api/connectors/custom')
      .set('x-owox-authorization', MEMBER_TOKEN)
      .send({ name, title: 'Member owned', manifest: { ...MANIFEST, name } });
    expect(created.status).toBe(201);

    const draft = await agent
      .put(`/api/connectors/custom/${created.body.id}/draft`)
      .set('x-owox-authorization', MEMBER_TOKEN)
      .send({ manifest: { ...MANIFEST, name } });
    expect(draft.status).toBe(200);

    const published = await agent
      .post(`/api/connectors/custom/${created.body.id}/publish`)
      .set('x-owox-authorization', MEMBER_TOKEN);
    expect(published.status).toBe(201);
    expect(published.body.status).toBe('published');
  });
});
