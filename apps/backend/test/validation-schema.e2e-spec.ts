import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  AUTH_HEADER,
  StorageBuilder,
  DataMartBuilder,
  setupPublishedDataMart,
} from '@owox/test-utils';

describe('Validation & Schema API (e2e)', () => {
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

  describe('with published DataMart', () => {
    let dataMartId: string;

    beforeAll(async () => {
      const setup = await setupPublishedDataMart(agent);
      dataMartId = setup.dataMartId;
    });

    // VALID-01: Validate definition returns response shape
    it('POST /api/data-marts/:id/validate-definition - returns { valid } shape', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/validate-definition`)
        .set(AUTH_HEADER);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        valid: expect.any(Boolean),
      });
    });

    // VALID-02: Update schema with non-empty object
    it('PUT /api/data-marts/:id/schema - updates schema with non-empty object', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/schema`)
        .set(AUTH_HEADER)
        .send({
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [
              {
                name: 'col1',
                type: 'STRING',
                mode: 'NULLABLE',
                status: 'CONNECTED',
              },
            ],
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(dataMartId);
    });

    // VALID-03: Update description
    it('PUT /api/data-marts/:id/description - updates description', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/description`)
        .set(AUTH_HEADER)
        .send({ description: 'Updated description for E2E test' });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe('Updated description for E2E test');
    });

    // VALID-04: Empty schema returns 400
    it('PUT /api/data-marts/:id/schema - returns 400 for empty schema object', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/schema`)
        .set(AUTH_HEADER)
        .send({ schema: {} });

      expect(res.status).toBe(400);
      expect(res.body.statusCode).toBe(400);
    });
  });

  describe('without definition', () => {
    let draftDataMartId: string;

    beforeAll(async () => {
      // Create storage
      const storageRes = await agent
        .post('/api/data-storages')
        .set(AUTH_HEADER)
        .send(new StorageBuilder().build());
      expect(storageRes.status).toBe(201);

      // Create draft DataMart (no definition set)
      const dataMartRes = await agent
        .post('/api/data-marts')
        .set(AUTH_HEADER)
        .send(
          new DataMartBuilder()
            .withStorageId(storageRes.body.id)
            .build(),
        );
      expect(dataMartRes.status).toBe(201);

      draftDataMartId = dataMartRes.body.id;
    });

    // VALID-05: Validate definition on DataMart without definition returns 200 with valid=false
    it('POST /api/data-marts/:id/validate-definition - returns valid=false with errorMessage', async () => {
      const res = await agent
        .post(`/api/data-marts/${draftDataMartId}/validate-definition`)
        .set(AUTH_HEADER);

      expect(res.status).toBe(201);
      expect(res.body.valid).toBe(false);
      expect(res.body.errorMessage).toContain('DataMart definition not found');
    });
  });
});
