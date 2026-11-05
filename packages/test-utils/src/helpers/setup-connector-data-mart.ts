import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';
import { StorageBuilder } from '../fixtures/storage.builder';
import { DataStorageType } from '../../../../apps/backend/src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { createDataMart, publishDataMartAndCancelAutoRun } from './data-mart-publish-flow';

const OPEN_HOLIDAYS_FIXTURE_DIR = path.join(__dirname, '../fixtures/open-holidays');
const OPEN_HOLIDAYS_RESPONSE = fs.readFileSync(
  path.join(OPEN_HOLIDAYS_FIXTURE_DIR, 'public-holidays.json'),
  'utf8'
);

/** The rows a run of these Data Marts loads: the fixture's `id`, `date` and English `name`. */
export const OPEN_HOLIDAYS_FIXTURE_ROWS: ReadonlyArray<{ id: string; date: string; name: string }> =
  (
    JSON.parse(OPEN_HOLIDAYS_RESPONSE) as Array<{
      id: string;
      startDate: string;
      name: Array<{ language: string; text: string }>;
    }>
  ).map(holiday => ({
    id: holiday.id,
    date: holiday.startDate,
    name: holiday.name.find(entry => entry.language === 'EN')!.text,
  }));

let openHolidaysFixture: Promise<http.Server> | undefined;

/** Connector runs inherit NODE_OPTIONS, whose preload sends OpenHolidays requests here. */
async function serveOpenHolidaysFixture(): Promise<void> {
  openHolidaysFixture ??= new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(OPEN_HOLIDAYS_RESPONSE);
    });
    server.on('error', reject);
    // Unreferenced, so a test file that never calls closeTestApp still exits.
    server.listen(0, '127.0.0.1', () => {
      server.unref();
      resolve(server);
    });
  });
  const { port } = (await openHolidaysFixture).address() as AddressInfo;
  process.env.OW_TEST_OPEN_HOLIDAYS_URL = `http://127.0.0.1:${port}`;
  const preload = `--require ${JSON.stringify(path.join(OPEN_HOLIDAYS_FIXTURE_DIR, 'fetch-to-fixture.cjs'))}`;
  if (!process.env.NODE_OPTIONS?.includes(preload)) {
    process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, preload].filter(Boolean).join(' ');
  }
}

/** Stops the test file's OpenHolidays fixture server, if it started one. */
export async function closeOpenHolidaysFixture(): Promise<void> {
  const server = await openHolidaysFixture?.catch(() => undefined);
  openHolidaysFixture = undefined;
  if (!server) return;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

export interface SetupConnectorDataMartOptions {
  /** Storage type to provision. Defaults to GOOGLE_BIGQUERY. */
  storageType?: DataStorageType;
  /** An existing storage of `storageType` to use instead of creating one. */
  storageId?: string;
  /**
   * `fullyQualifiedName` written into the CONNECTOR definition's `storage` block.
   * Defaults to `'test_dataset.test_holidays'`.
   */
  fullyQualifiedName?: string;
}

/**
 * Creates a full storage -> data mart -> CONNECTOR definition -> publish chain via HTTP.
 *
 * Uses the OpenHolidays connector (no OAuth/secrets required); its runs read the fixture in
 * `fixtures/open-holidays`, whose rows are `OPEN_HOLIDAYS_FIXTURE_ROWS`.
 * Returns the storageId and dataMartId for downstream test use.
 * The resulting data mart has status PUBLISHED with a CONNECTOR definition.
 *
 * Requires the NestJS app instance to seed storage config and credentials
 * directly in the database (the update-storage API validates against real
 * cloud services which is not possible in tests).
 *
 * DuckDB (`storageType: DataStorageType.DUCKDB`) is credential-less and
 * file-backed: no `data_storage_credentials` row is seeded and `config` is
 * written as `{}` (the actual `.duckdb` file path is derived at run time from
 * `DUCKDB_DATA_DIR` + the storage id, not stored in config).
 */
export async function setupConnectorDataMart(
  agent: supertest.Agent,
  app: INestApplication,
  options?: SetupConnectorDataMartOptions
): Promise<{ storageId: string; dataMartId: string }> {
  const storageType = options?.storageType ?? DataStorageType.GOOGLE_BIGQUERY;
  const fullyQualifiedName = options?.fullyQualifiedName ?? 'test_dataset.test_holidays';
  await serveOpenHolidaysFixture();
  const storageId = options?.storageId ?? (await createStorage(agent, app, storageType));

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

/** Steps 1-2: creates a storage of `storageType` and seeds what its runs need. */
async function createStorage(
  agent: supertest.Agent,
  app: INestApplication,
  storageType: DataStorageType
): Promise<string> {
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

  const storageId: string = storageRes.body.id;

  // Step 2: Seed storage config (+ credential, unless DuckDB) directly in DB.
  // The update-storage API calls cloud access validation which requires real
  // credentials, so we bypass it by writing directly to the database.
  if (storageType === DataStorageType.DUCKDB) {
    // DuckDB is credential-less -- no data_storage_credentials row. The empty
    // config is intentional (Task 3's resolver returns `{}`; the DatabasePath
    // is derived at run time from DUCKDB_DATA_DIR + storage id).
    await dataSource.query(`UPDATE data_storage SET config = ? WHERE id = ?`, [
      JSON.stringify({}),
      storageId,
    ]);
  } else {
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
  }

  return storageId;
}
