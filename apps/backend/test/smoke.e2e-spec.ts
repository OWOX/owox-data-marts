import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp } from '@owox/test-utils';

describe('Smoke Test', () => {
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

  it('should boot the app and respond to GET /api/data-storages', async () => {
    const response = await agent
      .get('/api/data-storages')
      .set('x-owox-authorization', 'test-token');

    // Should get 200 with empty array (no data yet)
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.any(Object));
  });

  it('should enforce foreign key constraints (PRAGMA foreign_keys = ON)', async () => {
    const { DataSource } = await import('typeorm');
    const dataSource = app.get(DataSource);
    const result = await dataSource.query('PRAGMA foreign_keys');
    // Result should be [{ foreign_keys: 1 }] when ON
    expect(result[0].foreign_keys).toBe(1);
  });
});
