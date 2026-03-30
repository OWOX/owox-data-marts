import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';
import { StorageBuilder } from '../fixtures/storage.builder';
import { DataMartBuilder } from '../fixtures/data-mart.builder';

/**
 * Creates a full storage -> data mart -> definition -> publish chain via HTTP.
 *
 * Returns the storageId and dataMartId for downstream test use.
 * The resulting data mart has status PUBLISHED with a SQL definition of `SELECT 1`.
 */
export async function setupPublishedDataMart(
  agent: supertest.Agent,
): Promise<{ storageId: string; dataMartId: string }> {
  // Step 1: Create storage
  const storageRes = await agent
    .post('/api/data-storages')
    .set(AUTH_HEADER)
    .send(new StorageBuilder().build());
  expect(storageRes.status).toBe(201);

  const storageId = storageRes.body.id;

  // Step 2: Create data mart linked to storage
  const dataMartRes = await agent
    .post('/api/data-marts')
    .set(AUTH_HEADER)
    .send(new DataMartBuilder().withStorageId(storageId).build());
  expect(dataMartRes.status).toBe(201);

  const dataMartId = dataMartRes.body.id;

  // Step 3: Set SQL definition
  const defRes = await agent
    .put(`/api/data-marts/${dataMartId}/definition`)
    .set(AUTH_HEADER)
    .send({ definitionType: 'SQL', definition: { sqlQuery: 'SELECT 1' } });
  expect(defRes.status).toBe(200);

  // Step 4: Publish
  const publishRes = await agent
    .put(`/api/data-marts/${dataMartId}/publish`)
    .set(AUTH_HEADER);
  expect(publishRes.status).toBe(200);

  return { storageId, dataMartId };
}
