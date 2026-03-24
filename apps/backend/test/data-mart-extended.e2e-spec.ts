import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  AUTH_HEADER,
  NONEXISTENT_UUID,
  setupPublishedDataMart,
  StorageBuilder,
  DataMartBuilder,
} from '@owox/test-utils';

describe('DataMart Extended Operations (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    const setup = await setupPublishedDataMart(agent);
    dataMartId = setup.dataMartId;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  // DMART-01: Filter by connector -- SQL-type DataMarts are excluded by the service filter
  it('GET /api/data-marts/by-connector/GOOGLE_BIGQUERY - returns empty array for SQL-type DataMarts', async () => {
    const res = await agent.get('/api/data-marts/by-connector/GOOGLE_BIGQUERY').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });

  // DMART-02: Batch health status with valid IDs
  it('POST /api/data-marts/health-status - returns items for valid DataMart IDs', async () => {
    const res = await agent
      .post('/api/data-marts/health-status')
      .set(AUTH_HEADER)
      .send({ ids: [dataMartId] });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      dataMartId: dataMartId,
      connector: null,
      report: null,
      insight: null,
    });
  });

  // DMART-03: Batch health status with non-existent IDs -- returns items with null runs
  it('POST /api/data-marts/health-status - returns null runs for non-existent IDs', async () => {
    const res = await agent
      .post('/api/data-marts/health-status')
      .set(AUTH_HEADER)
      .send({ ids: [NONEXISTENT_UUID] });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      dataMartId: NONEXISTENT_UUID,
      connector: null,
      report: null,
      insight: null,
    });
  });

  // DMART-04: Batch health status with empty array -- no @ArrayMinSize validator, returns 200
  it('POST /api/data-marts/health-status - returns 200 with empty items for empty IDs array', async () => {
    const res = await agent
      .post('/api/data-marts/health-status')
      .set(AUTH_HEADER)
      .send({ ids: [] });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  // DMART-05: Batch health status exceeding 200 limit -- @ArrayMaxSize(200) validation
  it('POST /api/data-marts/health-status - returns 400 for more than 200 IDs', async () => {
    const fakeIds = Array.from(
      { length: 201 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`
    );

    const res = await agent
      .post('/api/data-marts/health-status')
      .set(AUTH_HEADER)
      .send({ ids: fakeIds });

    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
  });

  // DMART-06: Clone definition (set definition with sourceDataMartId)
  it('PUT /api/data-marts/:id/definition - accepts sourceDataMartId with SQL definition', async () => {
    // Create a target draft DataMart
    const storageRes = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().build());
    expect(storageRes.status).toBe(201);

    const dataMartRes = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send(new DataMartBuilder().withStorageId(storageRes.body.id).build());
    expect(dataMartRes.status).toBe(201);
    const targetDataMartId = dataMartRes.body.id;

    // Set definition on target with sourceDataMartId pointing to published source
    const res = await agent
      .put(`/api/data-marts/${targetDataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'SQL',
        definition: { sqlQuery: 'SELECT 1 AS cloned' },
        sourceDataMartId: dataMartId,
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(targetDataMartId);
  });
});
