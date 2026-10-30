import { INestApplication } from '@nestjs/common';
import { AUTH_HEADER, closeTestApp, createTestApp, StorageBuilder } from '@owox/test-utils';
import { randomUUID } from 'crypto';
import * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import {
  SOURCE_BINDING_CONSUMER_TYPE,
  sourceCredentialRequirement,
} from '../src/data-marts/connector-types/source-credential-state';
import { CUSTOM_CONNECTOR_DEFINITION_ID } from '../src/data-marts/connector-types/source-credential-definitions';
import { CredentialConsumerBinding } from '../src/data-marts/credentials/entities/credential-consumer-binding.entity';
import { requirementRevision } from '../src/data-marts/credentials/services/credential-requirement-revision';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { ConnectorSourceCredentialsService } from '../src/data-marts/services/connector/connector-source-credentials.service';
import { createCredential } from './fixtures/storage-credentials';

const OUT_OF_DATE = 'This page is out of date. Reload it.';
const CONNECTOR = 'OpenExchangeRates';
const DEFINITION_ID = `source:${CONNECTOR}:default`;
const CREDENTIAL_KEY = 'e2e_bridge_credential_app_id';
const OLD_KEY = 'e2e_bridge_old_row_app_id';

type ConfigItem = Record<string, unknown>;

/** Configurations a newer release bound to a Credential, as this release finds them after a rollback. */
describe('Bound Source configurations saved by the bridge release (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataSource: DataSource;
  let credentialId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    dataSource = app.get(DataSource);
    credentialId = await createCredential(app, {
      projectId: '0',
      definitionId: DEFINITION_ID,
      title: 'Rates key',
      secret: { fields: { AppId: CREDENTIAL_KEY } },
      publicMetadata: null,
      ownerIds: ['0'],
      contextIds: [],
    });
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  const definitionOf = (configuration: ConfigItem[]) => ({
    connector: {
      source: { name: CONNECTOR, configuration, node: 'historical', fields: ['date'] },
      storage: { fullyQualifiedName: 'test_dataset.rates' },
    },
  });

  /** A Data Mart whose configurations are each bound and keep an old key row, as a conversion leaves them. */
  async function givenBoundDataMart(count = 1) {
    const storage = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().withType(DataStorageType.GOOGLE_BIGQUERY).build())
      .expect(201);
    const dataMart = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send({ title: `Rates ${randomUUID()}`, storageId: storage.body.id })
      .expect(201);
    const dataMartId = dataMart.body.id as string;
    const requirement = sourceCredentialRequirement();
    const configuration: ConfigItem[] = [];
    for (let i = 0; i < count; i++) {
      const configId = randomUUID();
      const oldRow = await app
        .get(ConnectorSourceCredentialsService)
        .createSecretsForConfig('0', CONNECTOR, dataMartId, configId, { AppId: OLD_KEY });
      await dataSource.getRepository(CredentialConsumerBinding).insert({
        consumerType: SOURCE_BINDING_CONSUMER_TYPE,
        consumerId: dataMartId,
        requirementKey: configId,
        projectId: '0',
        credentialId,
        requirementSnapshot: requirement,
        requirementRevision: requirementRevision(requirement),
        configuredById: null,
        active: true,
      });
      configuration.push({ _id: configId, _secrets_id: oldRow.id, Symbols: `EUR${i}` });
    }
    await dataSource.query(
      "UPDATE data_mart SET definitionType = 'CONNECTOR', definition = ? WHERE id = ?",
      [JSON.stringify(definitionOf(configuration)), dataMartId]
    );
    return { dataMartId, configuration };
  }

  function put(dataMartId: string, configuration: ConfigItem[]) {
    return agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({ definitionType: 'CONNECTOR', definition: definitionOf(configuration) });
  }

  async function pageConfiguration(dataMartId: string): Promise<ConfigItem[]> {
    const read = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER).expect(200);
    return read.body.definition.connector.source.configuration;
  }

  async function storedConfiguration(dataMartId: string): Promise<ConfigItem[]> {
    const [row] = (await dataSource.query('SELECT definition FROM data_mart WHERE id = ?', [
      dataMartId,
    ])) as Array<{ definition: string }>;
    return JSON.parse(row.definition).connector.source.configuration;
  }

  async function bindings(dataMartId: string) {
    const rows = (await dataSource.query(
      'SELECT requirementKey, credentialId, active FROM credential_consumer_binding WHERE consumerType = ? AND consumerId = ?',
      [SOURCE_BINDING_CONSUMER_TYPE, dataMartId]
    )) as Array<{ requirementKey: string; credentialId: string; active: number | boolean }>;
    return rows.map(row => ({ ...row, active: Boolean(row.active) }));
  }

  async function oldRowKey(secretsId: unknown) {
    const row = await app
      .get(ConnectorSourceCredentialsService)
      .getCredentialsById(secretsId as string);
    return row?.credentials.AppId;
  }

  it('a save of the masked page keeps the binding and the stored definition', async () => {
    const { dataMartId, configuration } = await givenBoundDataMart();
    const page = await pageConfiguration(dataMartId);
    expect(page).toEqual([{ ...configuration[0], AppId: '**********' }]);

    const saved = await put(dataMartId, page);

    expect(saved.status).toBe(200);
    expect(await storedConfiguration(dataMartId)).toEqual(configuration);
    expect(await bindings(dataMartId)).toEqual([
      { requirementKey: configuration[0]._id, credentialId, active: true },
    ]);
    expect(JSON.stringify(saved.body)).not.toContain(OLD_KEY);
    expect(JSON.stringify(saved.body)).not.toContain(CREDENTIAL_KEY);
  });

  it('a typed key is refused as out of date and nothing is written', async () => {
    const { dataMartId, configuration } = await givenBoundDataMart();
    const [item] = await pageConfiguration(dataMartId);

    const res = await put(dataMartId, [{ ...item, AppId: 'e2e_bridge_typed_app_id' }]);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(OUT_OF_DATE);
    expect(await storedConfiguration(dataMartId)).toEqual(configuration);
    expect(await oldRowKey(configuration[0]._secrets_id)).toBe(OLD_KEY);
    expect(await bindings(dataMartId)).toEqual([
      { requirementKey: configuration[0]._id, credentialId, active: true },
    ]);
  });

  it("a removed configuration's binding becomes inactive", async () => {
    const { dataMartId, configuration } = await givenBoundDataMart(2);
    const [first] = await pageConfiguration(dataMartId);

    await put(dataMartId, [first]).expect(200);

    expect(await bindings(dataMartId)).toEqual(
      expect.arrayContaining([
        { requirementKey: configuration[0]._id, credentialId, active: true },
        { requirementKey: configuration[1]._id, credentialId, active: false },
      ])
    );
  });

  it('deleting the Data Mart deactivates its bindings', async () => {
    const { dataMartId, configuration } = await givenBoundDataMart();

    await agent.delete(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER).expect(200);

    expect(await bindings(dataMartId)).toEqual([
      { requirementKey: configuration[0]._id, credentialId, active: false },
    ]);
  });

  it('GET /credentials lists the Source Credential', async () => {
    const res = await agent.get('/api/credentials').set(AUTH_HEADER).expect(200);

    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: credentialId,
          definition: expect.objectContaining({ id: DEFINITION_ID }),
        }),
      ])
    );
    expect(JSON.stringify(res.body)).not.toContain(CREDENTIAL_KEY);
  });

  it('GET /credentials/definitions offers no Source provider', async () => {
    const res = await agent.get('/api/credentials/definitions').set(AUTH_HEADER).expect(200);
    const ids = (res.body as Array<{ id: string }>).map(definition => definition.id);

    expect(ids.length).toBeGreaterThan(0);
    expect(
      ids.filter(id => id.startsWith('source:') || id === CUSTOM_CONNECTOR_DEFINITION_ID)
    ).toEqual([]);
  });
});
