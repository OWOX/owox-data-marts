import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';
import { DataMartBuilder } from '../fixtures/data-mart.builder';
import { StorageBuilder } from '../fixtures/storage.builder';
import { DataStorageType } from '../../../../apps/backend/src/data-marts/data-storage-types/enums/data-storage-type.enum';

export interface SeedDataMartOptions {
  agent: supertest.Agent;
  /** Raw BigQuery service-account JSON (process.env.BQ_SERVICE_ACCOUNT_KEY). */
  bigQueryServiceAccountJson: string;
  /** GCP project ID for the BigQuery storage. */
  bigQueryProjectId: string;
  /** SQL the data mart will execute. Must be valid for BigQuery. */
  sqlQuery: string;
  /** Optional human-friendly title; defaults to `Integration Test DM <timestamp>`. */
  title?: string;
}

export interface SeedDataMartResult {
  storageId: string;
  dataMartId: string;
}

/**
 * Provisions a fully-published BigQuery-backed data mart with a custom SQL
 * definition for use in Google Sheets export integration tests.
 *
 * Why BigQuery: the report-run pipeline executes the data mart's SQL through
 * the storage adapter, so the storage must point at a real warehouse the
 * test service account can reach. BigQuery is what the existing
 * `bigquery.integration.ts` suite already exercises in CI, so the same
 * `BQ_*` secrets work here without new infra.
 *
 * Steps:
 *   1. POST /api/data-storages — create empty BigQuery storage.
 *   2. PUT  /api/data-storages/:id — set credentials + projectId config.
 *   3. PUT  /api/data-storages/:id/availability — flip flags (storage is
 *      created "Not Available" by default; data marts cannot use it until
 *      flipped).
 *   4. POST /api/data-marts — create data mart linked to storage.
 *   5. PUT  /api/data-marts/:id/definition — install the SQL.
 *   6. POST /api/data-marts/:id/schema-actualize-triggers — refresh schema
 *      so output schema reflects SQL columns.
 *   7. PUT  /api/data-marts/:id/availability — flip availability flags.
 *   8. PUT  /api/data-marts/:id/publish — publish so reports can run.
 *
 * Once a data mart is published its SQL definition becomes immutable. Tests
 * that need a different SQL must call this helper again to provision a fresh
 * data mart (cheap — no warehouse table is created).
 */
export async function seedDataMartWithSql(opts: SeedDataMartOptions): Promise<SeedDataMartResult> {
  const { agent, bigQueryServiceAccountJson, bigQueryProjectId, sqlQuery } = opts;
  const title = opts.title ?? `Integration Test DM ${Date.now()}`;

  // Step 1: create empty BigQuery storage.
  const storageRes = await agent
    .post('/api/data-storages')
    .set(AUTH_HEADER)
    .send(new StorageBuilder().withType(DataStorageType.GOOGLE_BIGQUERY).build());
  expect(storageRes.status).toBe(201);
  const storageId = storageRes.body.id;

  // Step 2: install BigQuery credentials + projectId config.
  const updateStorageRes = await agent
    .put(`/api/data-storages/${storageId}`)
    .set(AUTH_HEADER)
    .send({
      title: `Integration Test Storage ${Date.now()}`,
      credentials: {
        type: 'bigquery-service-account-credentials',
        serviceAccountKey: JSON.parse(bigQueryServiceAccountJson),
      },
      config: {
        type: 'bigquery-config',
        projectId: bigQueryProjectId,
        location: 'autodetect',
      },
    });
  expect(updateStorageRes.status).toBe(200);

  // Step 3: flip availability flags on storage.
  await agent
    .put(`/api/data-storages/${storageId}/availability`)
    .set(AUTH_HEADER)
    .send({ availableForUse: true, availableForMaintenance: true });

  // Step 4: create data mart linked to the storage.
  const dataMartRes = await agent
    .post('/api/data-marts')
    .set(AUTH_HEADER)
    .send(new DataMartBuilder().withStorageId(storageId).withTitle(title).build());
  expect(dataMartRes.status).toBe(201);
  const dataMartId = dataMartRes.body.id;

  // Step 5: install SQL definition.
  const defRes = await agent
    .put(`/api/data-marts/${dataMartId}/definition`)
    .set(AUTH_HEADER)
    .send({ definitionType: 'SQL', definition: { sqlQuery } });
  expect(defRes.status).toBe(200);

  // Step 6: refresh schema so OutputSchema reflects SQL columns.
  const actualizeRes = await agent
    .post(`/api/data-marts/${dataMartId}/schema-actualize-triggers`)
    .set(AUTH_HEADER);
  expect([200, 201]).toContain(actualizeRes.status);

  // Step 7: flip availability flags on data mart.
  await agent
    .put(`/api/data-marts/${dataMartId}/availability`)
    .set(AUTH_HEADER)
    .send({ availableForReporting: true, availableForMaintenance: true });

  // Step 8: publish.
  const publishRes = await agent.put(`/api/data-marts/${dataMartId}/publish`).set(AUTH_HEADER);
  expect(publishRes.status).toBe(200);

  return { storageId, dataMartId };
}
