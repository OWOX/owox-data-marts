import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  DataDestinationBuilder,
  LOOKER_STUDIO_CREDENTIALS,
  AUTH_HEADER,
} from '@owox/test-utils';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';

// Tests are order-dependent: Create -> Get -> List -> Update -> Delete -> Verify -> Validation
describe('DataDestination API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let createdId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  // DEST-01: Create data destination
  it('POST /api/data-destinations - creates a LOOKER_STUDIO destination', async () => {
    const payload = new DataDestinationBuilder()
      .withType(DataDestinationType.LOOKER_STUDIO)
      .withCredentials(LOOKER_STUDIO_CREDENTIALS)
      .build();

    const res = await agent
      .post('/api/data-destinations')
      .set(AUTH_HEADER)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      title: 'Test Destination',
      type: 'LOOKER_STUDIO',
      credentials: expect.objectContaining({
        type: 'looker-studio-credentials',
        destinationSecretKey: expect.any(String),
      }),
    });

    createdId = res.body.id;
  });

  // DEST-02: Get data destination by ID
  it('GET /api/data-destinations/:id - returns the created destination', async () => {
    const res = await agent
      .get(`/api/data-destinations/${createdId}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: createdId,
      title: 'Test Destination',
      type: 'LOOKER_STUDIO',
      credentials: expect.objectContaining({
        type: 'looker-studio-credentials',
        destinationSecretKey: expect.any(String),
      }),
    });
  });

  // DEST-03: List all data destinations
  it('GET /api/data-destinations - lists all destinations including the created one', async () => {
    const res = await agent
      .get('/api/data-destinations')
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const found = res.body.find((item: any) => item.id === createdId);
    expect(found).toBeDefined();
  });

  // DEST-04: List by type (simplified response shape)
  it('GET /api/data-destinations/by-type/LOOKER_STUDIO - returns simplified shape', async () => {
    const res = await agent
      .get('/api/data-destinations/by-type/LOOKER_STUDIO')
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const found = res.body.find((item: any) => item.id === createdId);
    expect(found).toBeDefined();
    // DataDestinationByTypeResponseApiDto has id, title, dataMartName, identity
    expect(found).toHaveProperty('id');
    expect(found).toHaveProperty('title');
  });

  // DEST-05: Update data destination
  it('PUT /api/data-destinations/:id - updates the title', async () => {
    const res = await agent
      .put(`/api/data-destinations/${createdId}`)
      .set(AUTH_HEADER)
      .send({ title: 'Updated Destination' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Destination');
  });

  // DEST-07: Rotate secret key (first rotation)
  it('POST /api/data-destinations/:id/rotate-secret-key - returns new secret key', async () => {
    const res = await agent
      .post(`/api/data-destinations/${createdId}/rotate-secret-key`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(201);
    expect(res.body.credentials.destinationSecretKey).toEqual(
      expect.any(String),
    );
  });

  // DEST-07: Rotate secret key (second rotation produces different key)
  it('POST /api/data-destinations/:id/rotate-secret-key - second rotation produces different key', async () => {
    // First get the current key
    const before = await agent
      .get(`/api/data-destinations/${createdId}`)
      .set(AUTH_HEADER);

    const firstKey = before.body.credentials.destinationSecretKey;

    // Rotate
    const res = await agent
      .post(`/api/data-destinations/${createdId}/rotate-secret-key`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(201);
    const secondKey = res.body.credentials.destinationSecretKey;
    expect(secondKey).toEqual(expect.any(String));
    expect(secondKey).not.toBe(firstKey);
  });

  // DEST-06: Delete data destination
  it('DELETE /api/data-destinations/:id - soft deletes the destination', async () => {
    const res = await agent
      .delete(`/api/data-destinations/${createdId}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
  });

  // DEST-06 verify: Get after delete returns 404
  it('GET /api/data-destinations/:id - returns 404 after deletion', async () => {
    const res = await agent
      .get(`/api/data-destinations/${createdId}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });

  // DEST-08: Validation - missing required fields
  it('POST /api/data-destinations - returns 400 for empty body', async () => {
    const res = await agent
      .post('/api/data-destinations')
      .set(AUTH_HEADER)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
    });
  });

  // DEST-09: Validation - invalid destination type enum
  it('GET /api/data-destinations/by-type/INVALID_TYPE - returns 400', async () => {
    const res = await agent
      .get('/api/data-destinations/by-type/INVALID_TYPE')
      .set(AUTH_HEADER);

    expect(res.status).toBe(400);
  });
});
