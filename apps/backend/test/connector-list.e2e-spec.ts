import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp, AUTH_HEADER, ALL_CONNECTORS } from '@owox/test-utils';

describe('Connector List (e2e)', () => {
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

  // CAPI-01: GET /connectors returns all 14 connectors with name, title, logo, docUrl
  it('GET /api/connectors - returns all 14 connectors with required fields', async () => {
    const res = await agent.get('/api/connectors').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(ALL_CONNECTORS.length);

    // Verify every connector has the required structural fields
    res.body.forEach((connector: Record<string, unknown>) => {
      expect(connector).toHaveProperty('name');
      expect(typeof connector.name).toBe('string');
      expect(connector).toHaveProperty('title');
      expect(typeof connector.title).toBe('string');
      // logo and docUrl may be null but must be present as keys
      expect('logo' in connector).toBe(true);
      expect('docUrl' in connector).toBe(true);
    });

    // Verify all 14 connector names are present
    const returnedNames = res.body.map((c: Record<string, unknown>) => c.name);
    ALL_CONNECTORS.forEach(name => {
      expect(returnedNames).toContain(name);
    });
  });
});
