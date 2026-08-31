import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';
import { StorageBuilder } from '../fixtures/storage.builder';
import { DataStorageType } from '../../../../apps/backend/src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { createDataMart, publishDataMartAndCancelAutoRun } from './data-mart-publish-flow';

export interface SetupConnectorDataMartOptions {
  /** Storage type to provision. Defaults to GOOGLE_BIGQUERY. */
  storageType?: DataStorageType;
  /**
   * `fullyQualifiedName` written into the CONNECTOR definition's `storage` block.
   * Defaults to `'test_dataset.test_holidays'`.
   */
  fullyQualifiedName?: string;
}

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
  options?: SetupConnectorDataMartOptions
): Promise<{ storageId: string; dataMartId: string }> {
  const storageType = options?.storageType ?? DataStorageType.GOOGLE_BIGQUERY;
  const fullyQualifiedName = options?.fullyQualifiedName ?? 'test_dataset.test_holidays';

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
    .send(new StorageBuilder().withType(storageType).build());
  expect(storageRes.status).toBe(201);

  const storageId = storageRes.body.id;

  // Step 2: Seed storage config and credential directly in DB. The
  // update-storage API calls cloud access validation which requires real
  // credentials, so we bypass it by writing directly to the database.
  const credentialId = require('crypto').randomUUID();
  await dataSource.query(
    `INSERT INTO data_storage_credentials (id, projectId, type, credentials, createdAt, modifiedAt)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [credentialId, '0', 'google_service_account', JSON.stringify({ type: 'test-credentials' })]
  );
  await dataSource.query(`UPDATE data_storage SET config = ?, credentialId = ? WHERE id = ?`, [
    JSON.stringify({ projectId: 'test-project', dataset: 'test_dataset' }),
    credentialId,
    storageId,
  ]);

  // Step 3: Create data mart
  const dataMartId = await createDataMart(agent, storageId);

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
            fullyQualifiedName,
          },
        },
      },
    });
  expect(defRes.status).toBe(200);

  // Step 5-6: Publish, then cancel the auto-run triggered by publish.
  // PublishDataMartService now fires a connector run on publish (fire-and-forget);
  // downstream tests need it cancelled so they can trigger their own manual runs
  // without "already running" errors.
  await publishDataMartAndCancelAutoRun(agent, dataMartId);

  return { storageId, dataMartId };
}
