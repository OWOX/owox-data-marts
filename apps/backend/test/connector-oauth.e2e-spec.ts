import { INestApplication } from '@nestjs/common';
import type { IdpProvider, Payload } from '@owox/idp-protocol';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp, AUTH_HEADER } from '@owox/test-utils';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';

/**
 * Discover the OAuth field path dynamically from a connector's specification.
 *
 * Finds the top-level specification field whose `oneOf` array contains a variant
 * with the `OAUTH_FLOW` attribute, then returns `{fieldName}.{variantValue}`.
 *
 * Example: For GoogleAds, returns 'AuthType.oauth2'.
 */
async function getOAuthFieldPath(agent: supertest.Agent, connectorName: string): Promise<string> {
  const specRes = await agent
    .get(`/api/connectors/${connectorName}/specification`)
    .set(AUTH_HEADER);

  expect(specRes.status).toBe(200);

  const oauthField = specRes.body.find((field: Record<string, unknown>) => {
    const oneOf = field.oneOf as Array<Record<string, unknown>> | undefined;
    return oneOf?.some(variant => {
      const attrs = variant.attributes as string[] | undefined;
      return attrs?.includes('OAUTH_FLOW');
    });
  });

  expect(oauthField).toBeDefined();
  expect(oauthField.name).toBeDefined();

  const oauthVariant = oauthField.oneOf.find((variant: Record<string, unknown>) => {
    const attrs = variant.attributes as string[] | undefined;
    return attrs?.includes('OAUTH_FLOW');
  });

  expect(oauthVariant).toBeDefined();
  expect(oauthVariant.value).toBeDefined();

  return `${oauthField.name}.${oauthVariant.value}`;
}

const OAUTH_CONNECTORS = [
  'GoogleAds',
  'GoogleSheets',
  'FacebookMarketing',
  'TikTokAds',
  'MicrosoftAds',
];

describe('Connector OAuth Settings (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  // ---------------------------------------------------------------------------
  // CAPI-08: OAuth settings for OAuth connectors
  // Deep vars validation per user decision: check vars is non-empty object,
  // validate each var entry has a string key and a value of string|null
  // (resolved env values), and isEnabled is boolean.
  //
  // Note: parseOAuthVars() in connector.service.ts resolves each var config
  // to its runtime value. The API returns { ClientId: null, RedirectUri: null }
  // (flat resolved values), NOT the raw config objects with type/required/store.
  // Deep validation therefore checks per-var key (non-empty string) and value
  // type (string or null for each resolved env variable).
  // ---------------------------------------------------------------------------
  describe('OAuth connectors settings (CAPI-08)', () => {
    it.each(OAUTH_CONNECTORS)(
      'GET /api/connectors/%s/oauth/settings - returns vars and isEnabled',
      async connectorName => {
        // Step 1: Dynamically discover the OAuth field path from specification
        const path = await getOAuthFieldPath(agent, connectorName);

        // Step 2: Call oauth/settings with the discovered path
        const res = await agent
          .get(`/api/connectors/${connectorName}/oauth/settings`)
          .query({ path })
          .set(AUTH_HEADER);

        expect(res.status).toBe(200);

        // vars must be a non-empty object (OAuth connectors have UI variables)
        expect(res.body).toHaveProperty('vars');
        expect(typeof res.body.vars).toBe('object');
        expect(res.body.vars).not.toBeNull();
        const varEntries = Object.entries(res.body.vars);
        expect(varEntries.length).toBeGreaterThan(0);

        // Deep per-var validation: each var key is a non-empty string,
        // each value is either a string (resolved env value) or null (env var not set)
        varEntries.forEach(([varName, varValue]) => {
          // Key must be a non-empty string (e.g., 'ClientId', 'RedirectUri')
          expect(typeof varName).toBe('string');
          expect(varName.length).toBeGreaterThan(0);

          // Value must be string or null (parseOAuthVars resolves to env value or null)
          if (varValue !== null) {
            expect(typeof varValue).toBe('string');
          }
        });

        if (connectorName === 'GoogleSheets') {
          expect(res.body.vars).toHaveProperty('PickerApiKey');
          expect(res.body.vars).toHaveProperty('ProjectNumber');
        }

        // isEnabled is a boolean (false in test env because OAuth env vars are not set)
        expect(typeof res.body.isEnabled).toBe('boolean');
      }
    );
  });

  describe('OAuth exchange', () => {
    const env = {
      OAUTH_GOOGLE_ADS_CLIENT_ID: 'client-id-value',
      OAUTH_GOOGLE_ADS_CLIENT_SECRET: 'client-secret-value',
      OAUTH_GOOGLE_ADS_REDIRECT_URI: 'https://app.example.com/oauth',
      OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN: 'developer-token-value',
    };
    const tokens = [
      'refresh-value',
      'access-value',
      'client-secret-value',
      'developer-token-value',
    ];

    beforeEach(() => {
      jest.replaceProperty(process, 'env', { ...process.env, ...env });
      jest.spyOn(globalThis, 'fetch').mockImplementation(async input => {
        const url = String(input);
        if (url === 'https://oauth2.googleapis.com/token') {
          return Response.json({
            access_token: 'access-value',
            refresh_token: 'refresh-value',
            expires_in: 3600,
          });
        }
        if (url === 'https://www.googleapis.com/oauth2/v2/userinfo') {
          return Response.json({ id: '42', email: 'ads@example.com' });
        }
        throw new Error(`Unexpected request to ${url}`);
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('the existing connector OAuth e2e passes with a Credential id in the response', async () => {
      const exchanged = await agent
        .post('/api/connectors/GoogleAds/oauth/exchange')
        .set(AUTH_HEADER)
        .send({ fieldPath: 'AuthType.oauth2', payload: { code: 'code-value' } })
        .expect(201);

      expect(exchanged.body).toMatchObject({ success: true, credentialId: expect.any(String) });
      const credential = await agent
        .get(`/api/credentials/${exchanged.body.credentialId}`)
        .set(AUTH_HEADER)
        .expect(200);
      expect(credential.body).toMatchObject({
        title: 'ads@example.com',
        definition: { id: 'source:GoogleAds:oauth2' },
        availableForUse: false,
        availableForMaintenance: false,
      });
      const status = await agent
        .get(`/api/connectors/GoogleAds/oauth/status/${exchanged.body.credentialId}`)
        .set(AUTH_HEADER)
        .expect(200);
      expect(status.body).toMatchObject({
        valid: true,
        user: { id: '42', name: 'ads@example.com' },
      });
      for (const body of [exchanged.body, credential.body, status.body]) {
        for (const token of tokens) expect(JSON.stringify(body)).not.toContain(token);
      }
    });

    it('a viewer creates a Credential with Connect', async () => {
      const viewer: Payload = {
        userId: '2',
        email: 'viewer@localhost',
        roles: ['viewer'],
        fullName: 'Viewer',
        projectId: '0',
      };
      const expressApp = app.getHttpAdapter().getInstance() as { get(name: string): unknown };
      const idpProvider = expressApp.get('idp') as IdpProvider;
      jest.spyOn(idpProvider, 'introspectToken').mockResolvedValue(viewer);
      jest.spyOn(idpProvider, 'parseToken').mockResolvedValue(viewer);
      jest
        .spyOn(app.get(IdpProjectionsFacade), 'getProjectMembers')
        .mockResolvedValue([
          new ProjectMemberDto('2', 'viewer@localhost', 'Viewer', undefined, 'viewer', true, false),
        ]);

      const exchanged = await agent
        .post('/api/connectors/GoogleAds/oauth/exchange')
        .set(AUTH_HEADER)
        .send({ fieldPath: 'AuthType.oauth2', payload: { code: 'code-value' } })
        .expect(201);

      const credential = await agent
        .get(`/api/credentials/${exchanged.body.credentialId}`)
        .set(AUTH_HEADER)
        .expect(200);
      expect(credential.body).toMatchObject({ definition: { id: 'source:GoogleAds:oauth2' } });
    });

    it('refuses a connector whose OAuth app is not configured', async () => {
      delete process.env.OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN;

      await agent
        .post('/api/connectors/GoogleAds/oauth/exchange')
        .set(AUTH_HEADER)
        .send({ fieldPath: 'AuthType.oauth2', payload: { code: 'code-value' } })
        .expect(400);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Non-OAuth connector edge case (OpenHolidays)
  // Tests that a non-OAuth field path returns empty vars and isEnabled: false
  // ---------------------------------------------------------------------------
  describe('Non-OAuth connector edge case', () => {
    it('GET /api/connectors/OpenHolidays/oauth/settings - returns empty vars and isEnabled false', async () => {
      // OpenHolidays has a 'countryIsoCode' field in its specification.
      // Use it as the path -- the endpoint resolves the field but finds no OAUTH_FLOW attribute.
      // First, get the specification to find a valid field name
      const specRes = await agent
        .get('/api/connectors/OpenHolidays/specification')
        .set(AUTH_HEADER);

      expect(specRes.status).toBe(200);
      expect(specRes.body.length).toBeGreaterThan(0);

      // Use the first field name as path (e.g., 'countryIsoCode')
      const firstFieldName = specRes.body[0].name as string;

      const res = await agent
        .get('/api/connectors/OpenHolidays/oauth/settings')
        .query({ path: firstFieldName })
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('vars');
      expect(typeof res.body.vars).toBe('object');
      expect(Object.keys(res.body.vars)).toHaveLength(0);
      expect(res.body.isEnabled).toBe(false);
    });
  });
});
