import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupConnectorDataMart,
  AUTH_HEADER,
  NONEXISTENT_UUID,
} from '@owox/test-utils';

// Tests are order-dependent: Trigger run -> Cancel -> Trigger 2nd -> Get -> List -> Pagination -> 404
describe('DataMart Manual Runs API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;
  let firstRunId: string;
  let secondRunId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    // CONNECTOR-type DataMart required for manual runs
    const setup = await setupConnectorDataMart(agent, app);
    dataMartId = setup.dataMartId;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  // RUN-01: Trigger manual run
  it('POST /api/data-marts/:id/manual-run - triggers a manual run', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/manual-run`)
      .set(AUTH_HEADER)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      runId: expect.any(String),
    });

    firstRunId = res.body.runId;
  });

  // RUN-04: Cancel run (call immediately while still PENDING)
  it('POST /api/data-marts/:id/runs/:runId/cancel - cancels a pending run', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/runs/${firstRunId}/cancel`)
      .set(AUTH_HEADER);

    // Run may have already completed/failed (background execution is fast in SQLite).
    // 204 = cancelled successfully.
    // TODO: Backend should return 409 Conflict instead of 500 when cancelling a completed run.
    expect([204, 409]).toContain(res.status);
  });

  // RUN-01 (second run): Trigger another manual run for pagination tests
  it('POST /api/data-marts/:id/manual-run - triggers a second manual run', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/manual-run`)
      .set(AUTH_HEADER)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      runId: expect.any(String),
    });

    secondRunId = res.body.runId;
  });

  // RUN-03: Get run by ID
  it('GET /api/data-marts/:id/runs/:runId - returns the run by ID', async () => {
    const res = await agent
      .get(`/api/data-marts/${dataMartId}/runs/${firstRunId}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: firstRunId,
      dataMartId: dataMartId,
    });
  });

  // RUN-02: List run history
  it('GET /api/data-marts/:id/runs - lists run history with at least 2 entries', async () => {
    const res = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    // Response is wrapped: { runs: [...] }
    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(res.body.runs.length).toBeGreaterThanOrEqual(2);

    const runIds = res.body.runs.map((r: Record<string, unknown>) => r.id);
    expect(runIds).toContain(firstRunId);
    expect(runIds).toContain(secondRunId);
  });

  // RUN-05: Pagination
  it('GET /api/data-marts/:id/runs?limit=1 - pagination returns limited results', async () => {
    const res1 = await agent
      .get(`/api/data-marts/${dataMartId}/runs`)
      .query({ limit: 1, offset: 0 })
      .set(AUTH_HEADER);

    expect(res1.status).toBe(200);
    expect(res1.body.runs).toHaveLength(1);

    const res2 = await agent
      .get(`/api/data-marts/${dataMartId}/runs`)
      .query({ limit: 1, offset: 1 })
      .set(AUTH_HEADER);

    expect(res2.status).toBe(200);
    expect(res2.body.runs).toHaveLength(1);

    // The two pages should return different runs (proving offset works)
    expect(res2.body.runs[0].id).not.toBe(res1.body.runs[0].id);
  });

  // RUN-06: Non-existent DataMart returns 404
  it('POST /api/data-marts/:id/manual-run - returns 404 for non-existent DataMart', async () => {
    const res = await agent
      .post(`/api/data-marts/${NONEXISTENT_UUID}/manual-run`)
      .set(AUTH_HEADER)
      .send({});

    expect(res.status).toBe(404);
  });
});
