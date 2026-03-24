import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  StorageBuilder,
  DataMartBuilder,
  AUTH_HEADER,
} from '@owox/test-utils';

// Tests are order-dependent: Create -> List -> Get -> Update title -> Verify -> Publish -> Verify -> Delete -> Verify -> Validation
describe('DataMart API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let storageId: string;
  let createdDataMartId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    // Create a DataStorage first -- DataMart requires a valid storageId (FK constraint)
    const storagePayload = new StorageBuilder().build();
    const storageRes = await agent.post('/api/data-storages').set(AUTH_HEADER).send(storagePayload);

    expect(storageRes.status).toBe(201);
    storageId = storageRes.body.id;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  // API-06: Create DataMart
  it('POST /api/data-marts - creates a data mart', async () => {
    const payload = new DataMartBuilder()
      .withTitle('E2E Test DataMart')
      .withStorageId(storageId)
      .build();

    const res = await agent.post('/api/data-marts').set(AUTH_HEADER).send(payload);

    expect(res.status).toBe(201);
    // Create response only returns id and title (CreateDataMartResponseApiDto)
    expect(res.body).toMatchObject({
      id: expect.any(String),
      title: 'E2E Test DataMart',
    });

    createdDataMartId = res.body.id;
  });

  // API-07: List DataMarts
  it('GET /api/data-marts - lists data marts including the created one', async () => {
    const res = await agent.get('/api/data-marts').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: expect.any(Array),
      total: expect.any(Number),
    });

    const found = res.body.items.find((item: any) => item.id === createdDataMartId);
    expect(found).toBeDefined();
    expect(found.status).toBe('DRAFT');
  });

  // API-08: Get DataMart by ID
  it('GET /api/data-marts/:id - returns the created data mart', async () => {
    const res = await agent.get(`/api/data-marts/${createdDataMartId}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: createdDataMartId,
      title: 'E2E Test DataMart',
      status: 'DRAFT',
    });
  });

  // API-09: Update title
  it('PUT /api/data-marts/:id/title - updates the title', async () => {
    const res = await agent
      .put(`/api/data-marts/${createdDataMartId}/title`)
      .set(AUTH_HEADER)
      .send({ title: 'Updated DataMart Title' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Updated DataMart Title',
    });
  });

  // Verify title update persisted
  it('GET /api/data-marts/:id - returns updated title after update', async () => {
    const res = await agent.get(`/api/data-marts/${createdDataMartId}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Updated DataMart Title',
    });
  });

  // API-11: Publish (DRAFT -> PUBLISHED)
  // Publish requires a definition -- set one first via PUT :id/definition
  it('PUT /api/data-marts/:id/publish - publishes the data mart', async () => {
    // Set a SQL definition so the publish service accepts it
    const defRes = await agent
      .put(`/api/data-marts/${createdDataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'SQL',
        definition: { sqlQuery: 'SELECT 1' },
      });

    expect(defRes.status).toBe(200);

    // Now publish
    const res = await agent.put(`/api/data-marts/${createdDataMartId}/publish`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'PUBLISHED',
    });
  });

  // Verify publish persisted
  it('GET /api/data-marts/:id - returns PUBLISHED status after publish', async () => {
    const res = await agent.get(`/api/data-marts/${createdDataMartId}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'PUBLISHED',
    });
  });

  // API-10: Delete DataMart
  it('DELETE /api/data-marts/:id - soft deletes the data mart', async () => {
    const res = await agent.delete(`/api/data-marts/${createdDataMartId}`).set(AUTH_HEADER);

    // Delete returns 200 (void response)
    expect(res.status).toBe(200);
  });

  // Verify delete - soft-deleted should not be found
  it('GET /api/data-marts/:id - returns 404 after deletion', async () => {
    const res = await agent.get(`/api/data-marts/${createdDataMartId}`).set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  // API-13: Validation - missing all fields
  it('POST /api/data-marts - returns 400 for missing required fields', async () => {
    const res = await agent.post('/api/data-marts').set(AUTH_HEADER).send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
    });
  });

  // API-13: Validation - missing storageId
  it('POST /api/data-marts - returns 400 for missing storageId', async () => {
    const res = await agent.post('/api/data-marts').set(AUTH_HEADER).send({ title: 'No Storage' });

    expect(res.status).toBe(400);
  });

  // API-13: Validation - empty title
  it('POST /api/data-marts - returns 400 for empty title', async () => {
    const res = await agent.post('/api/data-marts').set(AUTH_HEADER).send({ title: '', storageId });

    expect(res.status).toBe(400);
  });

  // Additional: 404 for non-existent ID
  it('GET /api/data-marts/:id - returns 404 for non-existent ID', async () => {
    const res = await agent
      .get('/api/data-marts/00000000-0000-0000-0000-000000000000')
      .set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});
