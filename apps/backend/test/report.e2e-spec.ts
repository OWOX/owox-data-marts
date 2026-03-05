import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupReportPrerequisites,
  ReportBuilder,
  AUTH_HEADER,
  NONEXISTENT_UUID,
} from '@owox/test-utils';

// Tests are order-dependent: Create -> Get -> List -> Update -> Delete -> Verify -> Validation
describe('Report API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;
  let dataDestinationId: string;
  let createdId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    const prerequisites = await setupReportPrerequisites(agent);
    dataMartId = prerequisites.dataMartId;
    dataDestinationId = prerequisites.dataDestinationId;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  // RPT-01: Create report
  it('POST /api/reports - creates a report', async () => {
    const payload = new ReportBuilder()
      .withDataMartId(dataMartId)
      .withDataDestinationId(dataDestinationId)
      .build();

    const res = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
    });
    // LOOKER_STUDIO @BeforeInsert hook generates deterministic UUID v5 and resets title to ''
    expect(res.body.title).toBe('');

    createdId = res.body.id;
  });

  // RPT-02: Get report by ID
  it('GET /api/reports/:id - returns the created report', async () => {
    const res = await agent
      .get(`/api/reports/${createdId}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: createdId,
      title: '',
    });
  });

  // RPT-03: List reports by DataMart
  it('GET /api/reports/data-mart/:dataMartId - lists reports for the DataMart', async () => {
    const res = await agent
      .get(`/api/reports/data-mart/${dataMartId}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const found = res.body.find((item: any) => item.id === createdId);
    expect(found).toBeDefined();
  });

  // RPT-04: List all reports for project
  it('GET /api/reports - lists all reports including the created one', async () => {
    const res = await agent
      .get('/api/reports')
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const found = res.body.find((item: any) => item.id === createdId);
    expect(found).toBeDefined();
  });

  // RPT-05: Update report (full replacement: title + dataDestinationId + destinationConfig)
  it('PUT /api/reports/:id - updates the report', async () => {
    const res = await agent
      .put(`/api/reports/${createdId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Updated Report',
        dataDestinationId: dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 7200 },
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Report');
  });

  // RPT-07: Fire-and-forget report run
  it('POST /api/reports/:id/run - triggers a fire-and-forget run', async () => {
    const res = await agent
      .post(`/api/reports/${createdId}/run`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(201);
  });

  // RPT-06: Delete report
  it('DELETE /api/reports/:id - deletes the report', async () => {
    const res = await agent
      .delete(`/api/reports/${createdId}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
  });

  // RPT-06 verify: Get after delete returns 404
  it('GET /api/reports/:id - returns 404 after deletion', async () => {
    const res = await agent
      .get(`/api/reports/${createdId}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  // RPT-08: Validation - missing required fields
  it('POST /api/reports - returns 400 for empty body', async () => {
    const res = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
    });
  });

  // RPT-09: Non-existent dataMartId returns 404
  it('POST /api/reports - returns 404 for non-existent dataMartId', async () => {
    const payload = new ReportBuilder()
      .withDataMartId(NONEXISTENT_UUID)
      .withDataDestinationId(dataDestinationId)
      .build();

    const res = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send(payload);

    expect(res.status).toBe(404);
  });

  // RPT-10: List by insight template with non-matching ID returns empty array
  it('GET /api/reports/data-mart/:dataMartId/insight-template/:insightTemplateId - returns empty array for non-matching', async () => {
    const res = await agent
      .get(`/api/reports/data-mart/${dataMartId}/insight-template/${NONEXISTENT_UUID}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
