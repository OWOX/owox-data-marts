import { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp, AUTH_HEADER } from '@owox/test-utils';
import {
  ConnectorTestService,
  type ConnectorTestRequest,
} from '../src/data-marts/services/connector/connector-test.service';

const MANIFEST = {
  version: '1.0',
  name: 'ConcurrencyProbe',
  baseUrl: 'https://api.example.com',
  parameters: {},
  nodes: {
    items: {
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: ['data'] },
      fields: { id: { type: 'string' } },
    },
  },
};

/** Long enough that three requests fired together are unambiguously in flight at once. */
const HOLD_MS = 1500;

/**
 * The real service, with two substitutions so the route can be exercised without touching
 * the network: the child process is the fake-runner fixture instead of the connectors
 * runner, and every run is forced to occupy its slot for HOLD_MS. The concurrency limit
 * under test is the production one -- `runTest` is not overridden past forwarding, so the
 * acquire/release still runs inside the real implementation.
 */
class HoldingConnectorTestService extends ConnectorTestService {
  /** Incremented once per spawned child: `runnerPath()` is called exactly once per spawn. */
  spawns = 0;

  protected runnerPath(): string {
    this.spawns += 1;
    return join(__dirname, 'fixtures/fake-test-runner.mjs');
  }

  async runTest(args: ConnectorTestRequest) {
    return super.runTest({ ...args, _hang: true, timeoutMs: HOLD_MS });
  }
}

const testService = new HoldingConnectorTestService({
  get: (key: string, defaultValue?: unknown) =>
    key === 'MAX_CONNECTOR_TESTS_PER_PROJECT' ? 1 : defaultValue,
} as unknown as ConfigService);

describe('Custom Connector live test concurrency (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const testApp = await createTestApp([{ provide: ConnectorTestService, useValue: testService }]);
    app = testApp.app;
    agent = testApp.agent;
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  const runTest = () =>
    agent
      .post('/api/connectors/custom/test')
      .set(AUTH_HEADER)
      .send({ manifest: MANIFEST, node: 'items', configuration: {} });

  it('refuses concurrent live tests past the limit and spawns no extra child process', async () => {
    testService.spawns = 0;

    const responses = await Promise.all([runTest(), runTest(), runTest()]);

    const accepted = responses.filter(r => r.status === 201);
    const refused = responses.filter(r => r.status === 400);
    expect(accepted).toHaveLength(1);
    expect(refused).toHaveLength(2);

    // The status can be right while the process cap leaks — assert the spawns.
    expect(testService.spawns).toBe(1);

    for (const r of refused) {
      expect(r.body.code).toBe('CONNECTOR_TEST_CONCURRENCY_LIMIT');
      expect(r.body.message).toMatch(/already has 1 connector test running/i);
      expect(r.body.errorDetails).toEqual({
        scope: 'project',
        limit: 1,
        retryAfterSeconds: 20,
      });
    }
  }, 60_000);

  it('accepts the next request once the running test has finished', async () => {
    testService.spawns = 0;

    const after = await runTest();
    expect(after.status).toBe(201);
    expect(testService.spawns).toBe(1);
  }, 60_000);
});
