import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';
import { DataMartBuilder } from '../fixtures/data-mart.builder';

/**
 * Internal helper shared by `setupConnectorDataMart` and
 * `setupCustomConnectorDataMart` -- both build a storage, then a data mart,
 * then a CONNECTOR definition, then publish + cancel the auto-triggered run.
 * The storage-provisioning and definition-shape steps differ between the two
 * (bundled vs. custom connector), but "create the data mart" and "publish +
 * cancel the fire-and-forget auto-run" are byte-for-byte identical, so this
 * factors out just those two steps. Not part of the package's public API
 * (deliberately absent from `./index.ts`) -- it exists purely to de-duplicate
 * the two setup helpers, not as a standalone test-authoring utility.
 */

/**
 * `POST /api/data-marts` for the given storage. Returns the new data mart id.
 */
export async function createDataMart(agent: supertest.Agent, storageId: string): Promise<string> {
  const dataMartRes = await agent
    .post('/api/data-marts')
    .set(AUTH_HEADER)
    .send(new DataMartBuilder().withStorageId(storageId).build());
  expect(dataMartRes.status).toBe(201);
  return dataMartRes.body.id;
}

/**
 * Publishes the data mart -- which fires an automatic fire-and-forget run
 * (PublishDataMartService) -- then cancels any PENDING/RUNNING run so the
 * caller's own manual-run isn't rejected by "already running" and doesn't
 * count against MAX_CONNECTOR_RUNS_PER_PROJECT.
 */
export async function publishDataMartAndCancelAutoRun(
  agent: supertest.Agent,
  dataMartId: string
): Promise<void> {
  const publishRes = await agent.put(`/api/data-marts/${dataMartId}/publish`).set(AUTH_HEADER);
  expect(publishRes.status).toBe(200);

  // Allow the event loop to process the async run creation, then cancel any
  // active runs so downstream tests can trigger their own manual runs.
  await new Promise(resolve => setTimeout(resolve, 100));
  const runsRes = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);
  if (runsRes.body?.runs) {
    for (const run of runsRes.body.runs as Array<{ id: string; status: string }>) {
      if (run.status === 'PENDING' || run.status === 'RUNNING') {
        await agent.post(`/api/data-marts/${dataMartId}/runs/${run.id}/cancel`).set(AUTH_HEADER);
      }
    }
  }
}
