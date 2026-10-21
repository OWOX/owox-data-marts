import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  AUTH_HEADER,
  closeTestApp,
  createTestApp,
  DataMartBuilder,
  StorageBuilder,
} from '@owox/test-utils';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';

interface ListItem {
  id: string;
  relationshipsCount: number;
}

describe('Data Marts list relationships count (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let storageId: string;

  const createDataMart = async (title: string): Promise<string> => {
    const res = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send(new DataMartBuilder().withStorageId(storageId).withTitle(title).build());
    expect(res.status).toBe(201);
    return res.body.id;
  };

  const relate = async (sourceId: string, targetId: string, alias: string): Promise<void> => {
    const res = await agent
      .post(`/api/data-marts/${sourceId}/relationships`)
      .set(AUTH_HEADER)
      .send({
        targetDataMartId: targetId,
        targetAlias: alias,
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      });
    expect(res.status).toBe(201);
  };

  const listCounts = async (): Promise<Map<string, number>> => {
    const res = await agent.get('/api/data-marts').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    return new Map((res.body.items as ListItem[]).map(item => [item.id, item.relationshipsCount]));
  };

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    const storageRes = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().withType(DataStorageType.GOOGLE_BIGQUERY).build());
    expect(storageRes.status).toBe(201);
    storageId = storageRes.body.id;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('counts the relationships a Data Mart defines and the ones that point to it', async () => {
    const orders = await createDataMart(`Orders ${Date.now()}`);
    const customers = await createDataMart(`Customers ${Date.now()}`);
    const sessions = await createDataMart(`Sessions ${Date.now()}`);
    const products = await createDataMart(`Products ${Date.now()}`);

    await relate(orders, customers, 'customers');
    await relate(orders, customers, 'customers_billing');
    await relate(sessions, orders, 'orders');

    const counts = await listCounts();
    expect(counts.get(orders)).toBe(3);
    expect(counts.get(customers)).toBe(2);
    expect(counts.get(sessions)).toBe(1);
    expect(counts.get(products)).toBe(0);

    const deleteRes = await agent.delete(`/api/data-marts/${sessions}`).set(AUTH_HEADER);
    expect(deleteRes.status).toBe(200);

    const afterDelete = await listCounts();
    expect(afterDelete.get(orders)).toBe(2);
    expect(afterDelete.has(sessions)).toBe(false);
  });
});
