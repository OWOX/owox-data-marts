import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';

/**
 * Every plugin controller mounts on 'plugins', and one of them owns a catch-all
 * GET ':pluginId'. Nest matches in registration order, so a literal one-segment route
 * declared in a controller registered after the gallery is silently swallowed and
 * answered as a lookup for a plugin of that name.
 *
 * The rest of the plugin suite drives services directly, so nothing there can see this:
 * it only exists as a property of the wired HTTP app.
 */
describe('Plugin route registration (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  it.each([
    ['/api/plugins/installations?includeUninstalled=true', 'installations'],
    ['/api/plugins/gallery', 'gallery'],
  ])('%s reaches its own handler, not the plugin lookup', async path => {
    const res = await agent.get(path).set(AUTH_HEADER);

    // A 404 here means the request fell through to GET ':pluginId' and was answered as
    // "no such plugin" -- the exact failure this test exists to catch.
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
