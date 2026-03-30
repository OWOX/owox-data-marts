import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp, AUTH_HEADER, ALL_CONNECTORS } from '@owox/test-utils';

describe('Connector Specification (e2e)', () => {
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
  // CAPI-02: Public API connectors (OpenHolidays, BankOfCanada)
  // ---------------------------------------------------------------------------
  describe('Public API connectors (CAPI-02)', () => {
    it.each(['OpenHolidays', 'BankOfCanada'])(
      'GET /api/connectors/%s/specification - returns well-formed schema',
      async connectorName => {
        const res = await agent
          .get(`/api/connectors/${connectorName}/specification`)
          .set(AUTH_HEADER);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);

        res.body.forEach((item: Record<string, unknown>) => {
          expect(item).toHaveProperty('name');
          expect(typeof item.name).toBe('string');
        });

        // Public API connectors should NOT have OAUTH_FLOW attribute on any oneOf variant
        const hasOAuthFlow = res.body.some((item: Record<string, unknown>) => {
          const oneOf = item.oneOf as Array<Record<string, unknown>> | undefined;
          return oneOf?.some(v => {
            const attrs = v.attributes as string[] | undefined;
            return attrs?.includes('OAUTH_FLOW');
          });
        });
        expect(hasOAuthFlow).toBe(false);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // CAPI-03: API key connectors (OpenExchangeRates, GitHub)
  // ---------------------------------------------------------------------------
  describe('API key connectors (CAPI-03)', () => {
    it.each(['OpenExchangeRates', 'GitHub'])(
      'GET /api/connectors/%s/specification - returns well-formed schema',
      async connectorName => {
        const res = await agent
          .get(`/api/connectors/${connectorName}/specification`)
          .set(AUTH_HEADER);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);

        res.body.forEach((item: Record<string, unknown>) => {
          expect(item).toHaveProperty('name');
          expect(typeof item.name).toBe('string');
        });

        // API key connectors have SECRET attribute fields but no OAUTH_FLOW
        const hasSecret = res.body.some((item: Record<string, unknown>) => {
          const oneOf = item.oneOf as Array<Record<string, unknown>> | undefined;
          if (oneOf) {
            return oneOf.some(v => {
              const items = v.items as Record<string, Record<string, unknown>> | undefined;
              if (items) {
                return Object.values(items).some(field => {
                  const attrs = field.attributes as string[] | undefined;
                  return attrs?.includes('SECRET');
                });
              }
              return false;
            });
          }
          const attrs = item.attributes as string[] | undefined;
          return attrs?.includes('SECRET');
        });
        expect(hasSecret).toBe(true);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // CAPI-04: OAuth connectors (GoogleAds, FacebookMarketing)
  // ---------------------------------------------------------------------------
  describe('OAuth connectors (CAPI-04)', () => {
    it.each(['GoogleAds', 'FacebookMarketing'])(
      'GET /api/connectors/%s/specification - returns schema with OAUTH_FLOW attribute',
      async connectorName => {
        const res = await agent
          .get(`/api/connectors/${connectorName}/specification`)
          .set(AUTH_HEADER);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);

        // Must have at least one field with oneOf containing OAUTH_FLOW attribute
        const oauthField = res.body.find((item: Record<string, unknown>) => {
          const oneOf = item.oneOf as Array<Record<string, unknown>> | undefined;
          return oneOf?.some(v => {
            const attrs = v.attributes as string[] | undefined;
            return attrs?.includes('OAUTH_FLOW');
          });
        });

        expect(oauthField).toBeDefined();
        expect(oauthField.name).toBe('AuthType');

        // Verify the OAUTH_FLOW variant has a value (for constructing the oauth/settings path)
        const oauthVariant = oauthField.oneOf.find((v: Record<string, unknown>) => {
          const attrs = v.attributes as string[] | undefined;
          return attrs?.includes('OAUTH_FLOW');
        });
        expect(oauthVariant).toBeDefined();
        expect(typeof oauthVariant.value).toBe('string');
      }
    );
  });

  // ---------------------------------------------------------------------------
  // CAPI-06: Non-existent connector returns 404 for specification
  // ---------------------------------------------------------------------------
  describe('404 error handling (CAPI-06)', () => {
    it('GET /api/connectors/nonexistent-connector/specification - returns 404', async () => {
      const res = await agent
        .get('/api/connectors/nonexistent-connector/specification')
        .set(AUTH_HEADER);

      expect(res.status).toBe(404);
      expect(res.body.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // CAPI-09: All 14 connectors have well-formed specification schemas
  // ---------------------------------------------------------------------------
  describe('All connectors well-formed (CAPI-09)', () => {
    it.each([...ALL_CONNECTORS])(
      'GET /api/connectors/%s/specification - returns well-formed schema',
      async connectorName => {
        const res = await agent
          .get(`/api/connectors/${connectorName}/specification`)
          .set(AUTH_HEADER);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);

        // Every specification item must have a name (string)
        res.body.forEach((item: Record<string, unknown>) => {
          expect(item).toHaveProperty('name');
          expect(typeof item.name).toBe('string');
        });
      }
    );
  });
});
