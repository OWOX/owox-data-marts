import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp, AUTH_HEADER } from '@owox/test-utils';

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

const OAUTH_CONNECTORS = ['GoogleAds', 'FacebookMarketing', 'TikTokAds', 'MicrosoftAds'];

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
  // CAPI-08: OAuth settings for all 4 OAuth connectors
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

        // isEnabled is a boolean (false in test env because OAuth env vars are not set)
        expect(typeof res.body.isEnabled).toBe('boolean');
      }
    );
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
