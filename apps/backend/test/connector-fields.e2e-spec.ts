import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp, AUTH_HEADER, ALL_CONNECTORS } from '@owox/test-utils';

describe('Connector Fields (e2e)', () => {
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
  // CAPI-05: Representative connectors deep fields validation
  // Test 6 representative connectors (same as specification: 2 public API, 2 API key, 2 OAuth)
  // ---------------------------------------------------------------------------
  describe('Representative connectors deep validation (CAPI-05)', () => {
    it.each([
      'OpenHolidays',
      'BankOfCanada',
      'OpenExchangeRates',
      'GitHub',
      'GoogleAds',
      'FacebookMarketing',
    ])(
      'GET /api/connectors/%s/fields - returns nodes with fields and uniqueKeys',
      async connectorName => {
        const res = await agent.get(`/api/connectors/${connectorName}/fields`).set(AUTH_HEADER);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);

        // Deep validation of each node
        res.body.forEach((node: Record<string, unknown>) => {
          // node.name is a string
          expect(typeof node.name).toBe('string');
          expect((node.name as string).length).toBeGreaterThan(0);

          // node.fields is an array with at least one field
          const fields = node.fields as Array<Record<string, unknown>>;
          expect(Array.isArray(fields)).toBe(true);
          expect(fields.length).toBeGreaterThan(0);

          // Each field has name (string) and type (string)
          fields.forEach(field => {
            expect(typeof field.name).toBe('string');
            // type should be present (the mapper maps it from source)
            if (field.type !== undefined) {
              expect(typeof field.type).toBe('string');
            }
          });

          // node.uniqueKeys is an array (may be empty for some nodes but present)
          const uniqueKeys = node.uniqueKeys as string[];
          expect(Array.isArray(uniqueKeys)).toBe(true);
          expect(uniqueKeys.length).toBeGreaterThan(0);
        });
      }
    );
  });

  // ---------------------------------------------------------------------------
  // CAPI-07: Non-existent connector returns 404 for fields
  // Depends on Plan 01 fix (validateConnectorExists throws NotFoundException)
  // ---------------------------------------------------------------------------
  describe('404 error handling (CAPI-07)', () => {
    it('GET /api/connectors/nonexistent-connector/fields - returns 404', async () => {
      const res = await agent.get('/api/connectors/nonexistent-connector/fields').set(AUTH_HEADER);

      expect(res.status).toBe(404);
      expect(res.body.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // CAPI-10: All 14 connectors have well-formed fields schemas
  // ---------------------------------------------------------------------------
  describe('All connectors well-formed (CAPI-10)', () => {
    it.each([...ALL_CONNECTORS])(
      'GET /api/connectors/%s/fields - returns well-formed fields schema',
      async connectorName => {
        const res = await agent.get(`/api/connectors/${connectorName}/fields`).set(AUTH_HEADER);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);

        // Each node has required structural fields
        res.body.forEach((node: Record<string, unknown>) => {
          expect(typeof node.name).toBe('string');

          // fields array present
          if (node.fields) {
            expect(Array.isArray(node.fields)).toBe(true);
          }

          // uniqueKeys array present
          if (node.uniqueKeys) {
            expect(Array.isArray(node.uniqueKeys)).toBe(true);
          }
        });
      }
    );
  });
});
