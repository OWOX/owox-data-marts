import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupConnectorDataMart,
  ScheduledTriggerBuilder,
  AUTH_HEADER,
} from '@owox/test-utils';
import { ScheduledTriggerType } from '../src/data-marts/scheduled-trigger-types/enums/scheduled-trigger-type.enum';

// Tests are order-dependent: Create -> Get -> List -> Update -> Delete -> Verify -> Validation -> Isolation
describe('Scheduled Trigger API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;
  let createdId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    // CONNECTOR-type DataMart required for CONNECTOR_RUN triggers
    const setup = await setupConnectorDataMart(agent, app);
    dataMartId = setup.dataMartId;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  // TRIG-01: Create scheduled trigger
  it('POST /api/data-marts/:dataMartId/scheduled-triggers - creates a trigger', async () => {
    const payload = new ScheduledTriggerBuilder().build();

    const res = await agent
      .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
      .set(AUTH_HEADER)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      type: 'CONNECTOR_RUN',
      cronExpression: '0 * * * *',
      timeZone: 'UTC',
      createdAt: expect.any(String),
    });

    createdId = res.body.id;
  });

  // TRIG-02: Get trigger by ID
  it('GET /api/data-marts/:dataMartId/scheduled-triggers/:id - returns the created trigger', async () => {
    const res = await agent
      .get(`/api/data-marts/${dataMartId}/scheduled-triggers/${createdId}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: createdId,
      type: 'CONNECTOR_RUN',
    });
  });

  // TRIG-03: List triggers for DataMart
  it('GET /api/data-marts/:dataMartId/scheduled-triggers - lists triggers including the created one', async () => {
    const res = await agent
      .get(`/api/data-marts/${dataMartId}/scheduled-triggers`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const found = res.body.find((item: Record<string, unknown>) => item.id === createdId);
    expect(found).toBeDefined();
  });

  // TRIG-04: Update trigger
  it('PUT /api/data-marts/:dataMartId/scheduled-triggers/:id - updates cron, timeZone, isActive', async () => {
    const res = await agent
      .put(`/api/data-marts/${dataMartId}/scheduled-triggers/${createdId}`)
      .set(AUTH_HEADER)
      .send({
        cronExpression: '0 0 * * *',
        timeZone: 'America/New_York',
        isActive: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.cronExpression).toBe('0 0 * * *');
  });

  // TRIG-05: Delete trigger
  it('DELETE /api/data-marts/:dataMartId/scheduled-triggers/:id - deletes the trigger', async () => {
    const res = await agent
      .delete(`/api/data-marts/${dataMartId}/scheduled-triggers/${createdId}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
  });

  // TRIG-05 verify: Get after delete returns 404
  it('GET /api/data-marts/:dataMartId/scheduled-triggers/:id - returns 404 after deletion', async () => {
    const res = await agent
      .get(`/api/data-marts/${dataMartId}/scheduled-triggers/${createdId}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  // TRIG-06: Invalid cron expression with isActive:true
  it('POST /api/data-marts/:dataMartId/scheduled-triggers - rejects invalid cron expression', async () => {
    const payload = new ScheduledTriggerBuilder()
      .withCronExpression('INVALID_CRON')
      .withIsActive(true)
      .build();

    const res = await agent
      .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
      .set(AUTH_HEADER)
      .send(payload);

    expect(res.status).toBe(400);
  });

  // TRIG-07: Missing required fields
  it('POST /api/data-marts/:dataMartId/scheduled-triggers - returns 400 for empty body', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
      .set(AUTH_HEADER)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
    });
  });

  // TRIG-08: Invalid trigger type enum
  it('POST /api/data-marts/:dataMartId/scheduled-triggers - returns 400 for invalid type enum', async () => {
    const payload = new ScheduledTriggerBuilder()
      .withType('INVALID_TYPE' as ScheduledTriggerType)
      .build();

    const res = await agent
      .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
      .set(AUTH_HEADER)
      .send(payload);

    expect(res.status).toBe(400);
  });

  // TRIG-09: Cross-DataMart isolation
  it('triggers on DataMart A do not appear in DataMart B list', async () => {
    // Create two separate CONNECTOR-type DataMarts
    const setupA = await setupConnectorDataMart(agent, app);
    const setupB = await setupConnectorDataMart(agent, app);

    // Create a trigger on DataMart A
    const payload = new ScheduledTriggerBuilder().build();
    const createRes = await agent
      .post(`/api/data-marts/${setupA.dataMartId}/scheduled-triggers`)
      .set(AUTH_HEADER)
      .send(payload);
    expect(createRes.status).toBe(201);

    // List triggers for DataMart B -- should be empty
    const listRes = await agent
      .get(`/api/data-marts/${setupB.dataMartId}/scheduled-triggers`)
      .set(AUTH_HEADER);

    expect(listRes.status).toBe(200);
    expect(listRes.body).toEqual([]);
  });
});
