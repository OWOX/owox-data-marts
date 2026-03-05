import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp, StorageBuilder, AUTH_HEADER } from '@owox/test-utils';

describe('DataStorage API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let createdStorageId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  // API-01: Create
  it('POST /api/data-storages - creates a storage', async () => {
    const payload = new StorageBuilder().withType('GOOGLE_BIGQUERY' as any).build();

    const response = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      type: 'GOOGLE_BIGQUERY',
    });
    expect(response.body.id).toBeDefined();
    createdStorageId = response.body.id;
  });

  // API-02: List
  it('GET /api/data-storages - lists storages including the created one', async () => {
    const response = await agent
      .get('/api/data-storages')
      .set(AUTH_HEADER);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    const found = response.body.find(
      (item: any) => item.id === createdStorageId,
    );
    expect(found).toBeDefined();
    expect(found).toMatchObject({ type: 'GOOGLE_BIGQUERY' });
  });

  // API-03: Get by ID
  it('GET /api/data-storages/:id - returns the created storage', async () => {
    const response = await agent
      .get(`/api/data-storages/${createdStorageId}`)
      .set(AUTH_HEADER);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: createdStorageId,
      type: 'GOOGLE_BIGQUERY',
    });
  });

  // API-04: Update -- the update endpoint validates cloud storage access (config + credentials).
  // Without real cloud credentials, access validation rejects the request with 400.
  // This test verifies the endpoint is wired up: it accepts the request, runs validation,
  // and returns a structured error via BaseExceptionFilter.
  it('PUT /api/data-storages/:id - returns 400 when config fails access validation', async () => {
    const response = await agent
      .put(`/api/data-storages/${createdStorageId}`)
      .set(AUTH_HEADER)
      .send({ title: 'Updated Title', config: {} });

    if (response.status !== 400) {
      console.log('UPDATE response:', response.status, JSON.stringify(response.body));
    }
    expect(response.status).toBe(400);
    expect(response.body.statusCode).toBe(400);
  });

  // API-04: Verify that a failed update does not corrupt existing data
  it('GET /api/data-storages/:id - storage unchanged after failed update', async () => {
    const response = await agent
      .get(`/api/data-storages/${createdStorageId}`)
      .set(AUTH_HEADER);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: createdStorageId,
      type: 'GOOGLE_BIGQUERY',
    });
  });

  // API-04: Update with missing required fields returns 400 (DTO validation)
  it('PUT /api/data-storages/:id - returns 400 for missing required fields', async () => {
    const response = await agent
      .put(`/api/data-storages/${createdStorageId}`)
      .set(AUTH_HEADER)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.statusCode).toBe(400);
  });

  // API-05: Delete
  it('DELETE /api/data-storages/:id - soft deletes the storage', async () => {
    const response = await agent
      .delete(`/api/data-storages/${createdStorageId}`)
      .set(AUTH_HEADER);

    expect(response.status).toBe(200);
  });

  // Verify delete
  it('GET /api/data-storages/:id - returns 404 after deletion', async () => {
    const response = await agent
      .get(`/api/data-storages/${createdStorageId}`)
      .set(AUTH_HEADER);

    expect(response.status).toBe(404);
  });

  // API-12: Validation - missing type field
  it('POST /api/data-storages - returns 400 for missing type field', async () => {
    const response = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.statusCode).toBe(400);
  });

  // API-12: Validation - invalid type value
  it('POST /api/data-storages - returns 400 for invalid type value', async () => {
    const response = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send({ type: 'INVALID_TYPE' });

    expect(response.status).toBe(400);
    expect(response.body.statusCode).toBe(400);
  });

  // Additional: 404 for non-existent ID
  it('GET /api/data-storages/:id - returns 404 for non-existent ID', async () => {
    const response = await agent
      .get('/api/data-storages/00000000-0000-0000-0000-000000000000')
      .set(AUTH_HEADER);

    expect(response.status).toBe(404);
  });
});
