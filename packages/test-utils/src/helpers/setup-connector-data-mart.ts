import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';
import { StorageBuilder } from '../fixtures/storage.builder';
import { DataMartBuilder } from '../fixtures/data-mart.builder';

/**
 * Creates a full storage -> data mart -> CONNECTOR definition -> publish chain via HTTP.
 *
 * Uses the OpenHolidays connector (no OAuth/secrets required).
 * Returns the storageId and dataMartId for downstream test use.
 * The resulting data mart has status PUBLISHED with a CONNECTOR definition.
 *
 * Requires the NestJS app instance to seed storage config and credentials
 * directly in the database (the update-storage API validates against real
 * cloud services which is not possible in tests).
 */
export async function setupConnectorDataMart(
  agent: supertest.Agent,
  app: INestApplication,
): Promise<{ storageId: string; dataMartId: string }> {
  // Resolve DataSource and entity repositories from the backend workspace
  const backendRoot = require.resolve('@owox/backend/package.json');
  const backendDir = require('path').dirname(backendRoot);
  const resolveFromBackend = (pkg: string) =>
    require(require.resolve(pkg, { paths: [backendDir] }));

  const { DataSource } = resolveFromBackend('typeorm');
  const dataSource = app.get(DataSource);

  // Step 1: Create storage
  const storageRes = await agent
    .post('/api/data-storages')
    .set(AUTH_HEADER)
    .send(new StorageBuilder().build());
  expect(storageRes.status).toBe(201);

  const storageId = storageRes.body.id;

  // Step 2: Seed storage config + credential directly in DB.
  // The update-storage API calls cloud access validation which requires real
  // credentials, so we bypass it by writing directly to the database.
  const credentialId = require('crypto').randomUUID();
  await dataSource.query(
    `INSERT INTO data_storage_credentials (id, projectId, type, credentials, createdAt, modifiedAt)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [credentialId, '0', 'google_service_account', JSON.stringify({ type: 'test-credentials' })],
  );
  await dataSource.query(
    `UPDATE data_storage SET config = ?, credentialId = ? WHERE id = ?`,
    [JSON.stringify({ projectId: 'test-project', dataset: 'test_dataset' }), credentialId, storageId],
  );

  // Step 3: Create data mart
  const dataMartRes = await agent
    .post('/api/data-marts')
    .set(AUTH_HEADER)
    .send(new DataMartBuilder().withStorageId(storageId).build());
  expect(dataMartRes.status).toBe(201);

  const dataMartId = dataMartRes.body.id;

  // Step 4: Set CONNECTOR definition (OpenHolidays -- no OAuth/secrets)
  const defRes = await agent
    .put(`/api/data-marts/${dataMartId}/definition`)
    .set(AUTH_HEADER)
    .send({
      definitionType: 'CONNECTOR',
      definition: {
        connector: {
          source: {
            name: 'OpenHolidays',
            configuration: [{ countryIsoCode: 'CH', languageIsoCode: 'EN' }],
            node: 'publicHolidays',
            fields: ['id', 'date', 'name'],
          },
          storage: {
            fullyQualifiedName: 'test_dataset.test_holidays',
          },
        },
      },
    });
  expect(defRes.status).toBe(200);

  // Step 5: Publish
  const publishRes = await agent
    .put(`/api/data-marts/${dataMartId}/publish`)
    .set(AUTH_HEADER);
  expect(publishRes.status).toBe(200);

  return { storageId, dataMartId };
}
