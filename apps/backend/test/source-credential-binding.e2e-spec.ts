import { BadRequestException, INestApplication } from '@nestjs/common';
import type { IdpProvider, Payload } from '@owox/idp-protocol';
import { AUTH_HEADER, closeTestApp, createTestApp, StorageBuilder } from '@owox/test-utils';
import { randomUUID } from 'crypto';
import * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import { Credential } from '../src/data-marts/credentials/entities/credential.entity';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { SourceCredentialBindingService } from '../src/data-marts/connector-types/source-credential-binding.service';
import { SourceCredentialInjectorService } from '../src/data-marts/services/connector/source-credential-injector.service';
import { ConnectorSourceCredentialsService } from '../src/data-marts/services/connector/connector-source-credentials.service';
import { serviceAccountKey } from './fixtures/google-service-account-key';
import { createCredential } from './fixtures/storage-credentials';

const OTHER_AUTH_HEADER = { 'x-owox-authorization': 'other-token' };
const OUT_OF_DATE = 'This page is out of date. Reload it.';
const TOKEN = 'ghp_e2e_source_credential_token';
const OLD_GRANT = 'e2e_old_row_rotated_token';

function payload(userId: string, roles: Payload['roles']): Payload {
  return { userId, email: `${userId}@localhost`, roles, fullName: userId, projectId: '0' };
}

function resolvePayload(token: string): Payload {
  return token.startsWith('other') ? payload('3', ['editor']) : payload('0', ['admin']);
}

type ConfigItem = Record<string, unknown>;

describe('Selecting Source credentials in a Data Mart definition (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataSource: DataSource;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    dataSource = app.get(DataSource);

    const expressApp = app.getHttpAdapter().getInstance() as { get(name: string): unknown };
    const idpProvider = expressApp.get('idp') as IdpProvider;
    jest.spyOn(idpProvider, 'introspectToken').mockImplementation(async t => resolvePayload(t));
    jest.spyOn(idpProvider, 'parseToken').mockImplementation(async t => resolvePayload(t));
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  function givenGitHubToken(title = 'GitHub token'): Promise<string> {
    return createCredential(app, {
      projectId: '0',
      definitionId: 'github',
      title,
      secret: { value: TOKEN },
      publicMetadata: null,
      ownerIds: ['0'],
      contextIds: [],
    });
  }

  /** A draft Data Mart the admin created; new Data Marts are Shared for maintenance. */
  async function givenDataMart(): Promise<string> {
    const storage = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().withType(DataStorageType.GOOGLE_BIGQUERY).build())
      .expect(201);
    const dataMart = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send({ title: `GitHub stars ${Date.now()}`, storageId: storage.body.id })
      .expect(201);
    return dataMart.body.id;
  }

  function put(
    dataMartId: string,
    configuration: ConfigItem[],
    header = AUTH_HEADER,
    extra: Record<string, unknown> = {},
    connector = 'GitHub'
  ) {
    return agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(header)
      .send({
        definitionType: 'CONNECTOR',
        definition: {
          connector: {
            source: { name: connector, configuration, node: 'stars', fields: ['date'] },
            storage: { fullyQualifiedName: 'test_dataset.stars' },
          },
        },
        ...extra,
      });
  }

  function configurationOf(body: { definition: unknown }): ConfigItem[] {
    return (body.definition as { connector: { source: { configuration: ConfigItem[] } } }).connector
      .source.configuration;
  }

  async function storedConfiguration(dataMartId: string): Promise<ConfigItem[]> {
    const [row] = (await dataSource.query('SELECT definition FROM data_mart WHERE id = ?', [
      dataMartId,
    ])) as Array<{ definition: string }>;
    return JSON.parse(row.definition).connector.source.configuration;
  }

  async function bindings(dataMartId: string) {
    const rows = (await dataSource.query(
      "SELECT requirementKey, credentialId, active FROM credential_consumer_binding WHERE consumerType = 'connector-config' AND consumerId = ?",
      [dataMartId]
    )) as Array<{ requirementKey: string; credentialId: string; active: number | boolean }>;
    return rows.map(row => ({ ...row, active: Boolean(row.active) }));
  }

  async function givenBoundDataMart(credentialId: string) {
    const dataMartId = await givenDataMart();
    const saved = await put(dataMartId, [
      { _credential_id: credentialId, RepositoryName: 'owox/owox-data-marts' },
    ]).expect(200);
    const [{ _id: configId }] = configurationOf(saved.body);
    return { dataMartId, configId: configId as string, saved };
  }

  it('binds the selected Credential; the stored definition holds neither, the response returns it from the binding', async () => {
    const credentialId = await givenGitHubToken();

    const { dataMartId, configId, saved } = await givenBoundDataMart(credentialId);

    expect(configurationOf(saved.body)).toEqual([
      { _id: configId, _credential_id: credentialId, RepositoryName: 'owox/owox-data-marts' },
    ]);
    expect(saved.body.sourceCredentials).toEqual([
      {
        configId,
        summary: expect.objectContaining({ access: 'visible', id: credentialId, state: 'ready' }),
      },
    ]);
    expect(await storedConfiguration(dataMartId)).toEqual([
      { _id: configId, RepositoryName: 'owox/owox-data-marts' },
    ]);
    expect(await bindings(dataMartId)).toEqual([
      { requirementKey: configId, credentialId, active: true },
    ]);

    const read = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER).expect(200);
    expect(configurationOf(read.body)).toEqual(configurationOf(saved.body));
    expect(read.body.sourceCredentials).toEqual(saved.body.sourceCredentials);
    expect(JSON.stringify([saved.body, read.body])).not.toContain(TOKEN);
  });

  it('keeps an unchanged Credential for a maintainer without USE and refuses that maintainer a new selection', async () => {
    const credentialId = await givenGitHubToken();
    const { dataMartId, configId } = await givenBoundDataMart(credentialId);

    const read = await agent
      .get(`/api/data-marts/${dataMartId}`)
      .set(OTHER_AUTH_HEADER)
      .expect(200);
    expect(read.body.sourceCredentials).toEqual([
      { configId, summary: { access: 'restricted', state: 'ready' } },
    ]);
    const [config] = configurationOf(read.body);

    await put(dataMartId, [{ ...config, RepositoryName: 'owox/other' }], OTHER_AUTH_HEADER).expect(
      200
    );
    expect(await bindings(dataMartId)).toEqual([
      { requirementKey: configId, credentialId, active: true },
    ]);

    const added = await put(
      dataMartId,
      [config, { _credential_id: credentialId, RepositoryName: 'owox/third' }],
      OTHER_AUTH_HEADER
    );
    expect(added.status).toBe(403);
    expect(await bindings(dataMartId)).toHaveLength(1);
  });

  it('removing a configuration deactivates its binding', async () => {
    const credentialId = await givenGitHubToken();
    const dataMartId = await givenDataMart();
    const saved = await put(dataMartId, [
      { _credential_id: credentialId, RepositoryName: 'owox/a' },
      { _credential_id: credentialId, RepositoryName: 'owox/b' },
    ]).expect(200);
    const [first, second] = configurationOf(saved.body);

    await put(dataMartId, [first]).expect(200);

    expect(await bindings(dataMartId)).toEqual(
      expect.arrayContaining([
        { requirementKey: first._id, credentialId, active: true },
        { requirementKey: second._id, credentialId, active: false },
      ])
    );
  });

  it.each([
    ['a typed key value', [{ AccessToken: TOKEN, RepositoryName: 'owox/a' }], {}],
    ['sourceDataMartId', [{ RepositoryName: 'owox/a' }], { sourceDataMartId: randomUUID() }],
  ])(
    'rejects %s with "This page is out of date. Reload it."',
    async (_case, configuration, extra) => {
      const dataMartId = await givenDataMart();

      const res = await put(dataMartId, configuration, AUTH_HEADER, extra);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(OUT_OF_DATE);
      expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    }
  );

  it('refuses a new configuration without a Credential', async () => {
    const dataMartId = await givenDataMart();

    const res = await put(dataMartId, [{ RepositoryName: 'owox/a' }]);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Select a Credential for each configuration.');
  });

  it('a configuration still on its old row keeps it when saved unchanged', async () => {
    const dataMartId = await givenDataMart();
    const configId = randomUUID();
    const oldRow = await app
      .get(ConnectorSourceCredentialsService)
      .createSecretsForConfig('0', 'GitHub', dataMartId, configId, { AccessToken: TOKEN });
    await dataSource.query(
      "UPDATE data_mart SET definitionType = 'CONNECTOR', definition = ? WHERE id = ?",
      [
        JSON.stringify({
          connector: {
            source: {
              name: 'GitHub',
              configuration: [{ _id: configId, _secrets_id: oldRow.id, RepositoryName: 'owox/a' }],
              node: 'stars',
              fields: ['date'],
            },
            storage: { fullyQualifiedName: 'test_dataset.stars' },
          },
        }),
        dataMartId,
      ]
    );

    const read = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER).expect(200);
    const saved = await put(dataMartId, configurationOf(read.body)).expect(200);

    expect(configurationOf(saved.body)).toEqual([
      {
        _id: configId,
        _secrets_id: oldRow.id,
        AccessToken: '**********',
        RepositoryName: 'owox/a',
      },
    ]);
    expect(await storedConfiguration(dataMartId)).toEqual([
      { _id: configId, _secrets_id: oldRow.id, RepositoryName: 'owox/a' },
    ]);
    expect(await bindings(dataMartId)).toEqual([]);
    expect(JSON.stringify(saved.body)).not.toContain(TOKEN);
  });

  it('a configuration whose Credential was deleted shows no _credential_id and keeps its binding', async () => {
    const credentialId = await givenGitHubToken('Deleted token');
    const { dataMartId, configId } = await givenBoundDataMart(credentialId);
    await dataSource.getRepository(Credential).softDelete({ id: credentialId });

    const read = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER).expect(200);
    expect(configurationOf(read.body)).toEqual([
      { _id: configId, RepositoryName: 'owox/owox-data-marts' },
    ]);
    expect(read.body.sourceCredentials).toEqual([]);

    await put(dataMartId, configurationOf(read.body)).expect(200);
    expect(await bindings(dataMartId)).toEqual([
      { requirementKey: configId, credentialId, active: true },
    ]);
  });

  const credentialOf = (definitionId: string) =>
    createCredential(app, {
      projectId: '0',
      definitionId,
      title: definitionId,
      secret: { fields: { DeveloperToken: TOKEN } },
      publicMetadata: null,
      ownerIds: ['0'],
      contextIds: [],
    });
  const putGoogleAds = (dataMartId: string, configuration: ConfigItem[]) =>
    put(dataMartId, configuration, AUTH_HEADER, {}, 'GoogleAds');

  it('switching the auth variant keeps no stray variant and a later Credential change is accepted', async () => {
    const dataMartId = await givenDataMart();
    const saved = await putGoogleAds(dataMartId, [
      { _credential_id: await credentialOf('source:GoogleAds:oauth2'), AuthType: { oauth2: {} } },
    ]).expect(200);
    const [{ _id: configId }] = configurationOf(saved.body);
    // A converted OAuth configuration keeps its old reference beside the binding.
    await dataSource.query('UPDATE data_mart SET definition = ? WHERE id = ?', [
      JSON.stringify({
        connector: {
          source: {
            name: 'GoogleAds',
            configuration: [
              { _id: configId, AuthType: { oauth2: { _source_credential_id: 'old' } } },
            ],
            node: 'stars',
            fields: ['date'],
          },
          storage: { fullyQualifiedName: 'test_dataset.stars' },
        },
      }),
      dataMartId,
    ]);

    const serviceAccount = await credentialOf('source:GoogleAds:service_account');
    await putGoogleAds(dataMartId, [
      { _id: configId, _credential_id: serviceAccount, AuthType: { service_account: {} } },
    ]).expect(200);
    expect(await storedConfiguration(dataMartId)).toEqual([
      { _id: configId, AuthType: { service_account: {} } },
    ]);

    const read = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER).expect(200);
    const [config] = configurationOf(read.body);
    expect(config.AuthType).toEqual({ service_account: {} });
    const another = await credentialOf('source:GoogleAds:service_account');
    await putGoogleAds(dataMartId, [{ ...config, _credential_id: another }]).expect(200);
    expect(await bindings(dataMartId)).toEqual([
      { requirementKey: configId, credentialId: another, active: true },
    ]);
  });

  /** A GoogleAds configuration bound to `first` beside an old OAuth row holding a rotated token. */
  async function givenBoundBesideOldRow() {
    const first = await credentialOf('source:GoogleAds:oauth2');
    const dataMartId = await givenDataMart();
    const saved = await putGoogleAds(dataMartId, [
      { _credential_id: first, AuthType: { oauth2: {} } },
    ]).expect(200);
    const configId = configurationOf(saved.body)[0]._id as string;
    // An old row holding a rotated token.
    const oldRow = await app
      .get(ConnectorSourceCredentialsService)
      .createCredentials('0', '0', 'GoogleAds', { generated_refresh_token: OLD_GRANT }, null);
    await dataSource.query('UPDATE data_mart SET definition = ? WHERE id = ?', [
      JSON.stringify({
        connector: {
          source: {
            name: 'GoogleAds',
            configuration: [
              { _id: configId, AuthType: { oauth2: { _source_credential_id: oldRow.id } } },
            ],
            node: 'stars',
            fields: ['date'],
          },
          storage: { fullyQualifiedName: 'test_dataset.stars' },
        },
      }),
      dataMartId,
    ]);
    return { dataMartId, configId, first };
  }

  it("a rebound configuration drops its old reference, so a run never takes the old row's token", async () => {
    const { dataMartId, configId } = await givenBoundBesideOldRow();

    const rebound = await credentialOf('source:GoogleAds:oauth2');
    await putGoogleAds(dataMartId, [
      { _id: configId, _credential_id: rebound, AuthType: { oauth2: {} } },
    ]).expect(200);
    const [stored] = await storedConfiguration(dataMartId);
    const run = await app
      .get(SourceCredentialInjectorService)
      .resolveBoundConfig('0', dataMartId, 'GoogleAds', configId, stored, null);

    const credential = await app
      .get(SourceCredentialBindingService)
      .resolveForConfig('0', dataMartId, configId);
    expect(credential?.credentialId).toBe(rebound);
    expect(JSON.stringify(credential)).not.toContain(OLD_GRANT);
    expect(JSON.stringify(run)).not.toContain(OLD_GRANT);
    expect(stored).toEqual({ _id: configId, AuthType: { oauth2: {} } });
  });

  it('refuses a configuration sent twice in one save and stores nothing', async () => {
    const { dataMartId, configId, first } = await givenBoundBesideOldRow();
    const before = await storedConfiguration(dataMartId);
    const rebound = await credentialOf('source:GoogleAds:oauth2');
    const item = { _id: configId, _credential_id: rebound, AuthType: { oauth2: {} } };

    const res = await putGoogleAds(dataMartId, [item, item]);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(OUT_OF_DATE);
    expect(await storedConfiguration(dataMartId)).toEqual(before);
    expect(await bindings(dataMartId)).toEqual([
      { requirementKey: configId, credentialId: first, active: true },
    ]);
  });

  describe('Field preview with _credential_id', () => {
    const CANNOT_USE = 'You cannot use this Credential.';
    const PREVIEW_REFUSED = 'The selected credentials cannot be used for this preview';

    const sheetsKey = (projectId = '0') =>
      createCredential(app, {
        projectId,
        definitionId: 'google-service-account',
        title: 'Docs writer',
        secret: { value: serviceAccountKey() },
        publicMetadata: null,
        ownerIds: ['0'],
        contextIds: [],
      });

    const preview = (
      configuration: ConfigItem,
      dataMartId?: string,
      header: Record<string, string> = AUTH_HEADER
    ) =>
      agent
        .post('/api/connectors/GoogleSheets/fields/preview')
        .set(header)
        .send({ configuration, dataMartId });

    /** A GoogleSheets Data Mart bound to a service account key, with the key's USE and the Data Mart's maintenance given or not. */
    async function givenBoundSheets(use: boolean, maintenance: boolean) {
      const credentialId = await sheetsKey();
      const dataMartId = await givenDataMart();
      const saved = await put(
        dataMartId,
        [{ _credential_id: credentialId, AuthType: { service_account: {} } }],
        AUTH_HEADER,
        {},
        'GoogleSheets'
      ).expect(200);
      const config = configurationOf(saved.body)[0];
      await dataSource.query('UPDATE credential SET availableForUse = ? WHERE id = ?', [
        Number(use),
        credentialId,
      ]);
      await dataSource.query('UPDATE data_mart SET availableForMaintenance = ? WHERE id = ?', [
        Number(maintenance),
        dataMartId,
      ]);
      return { credentialId, dataMartId, config };
    }

    it.each([
      ['an unknown Credential', () => Promise.resolve(randomUUID())],
      ['a Credential of another project', () => sheetsKey('other-project')],
    ])('refuses %s', async (_case, given) => {
      const res = await preview({ _credential_id: await given() }, undefined, OTHER_AUTH_HEADER);

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(PREVIEW_REFUSED);
    });

    it('refuses a member with neither USE of the Credential nor EDIT of its Data Mart', async () => {
      const { dataMartId, config } = await givenBoundSheets(false, false);

      const res = await preview(config, dataMartId, OTHER_AUTH_HEADER);

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(CANNOT_USE);
    });

    it.each([
      ['USE of the Credential', true, false],
      ['EDIT of the bound Data Mart', false, true],
    ])('lets a member with %s through to the preview', async (_case, use, maintenance) => {
      const { credentialId, dataMartId, config } = await givenBoundSheets(use, maintenance);
      // Stubbed so the preview never calls Google; the rejection proves access passed.
      const resolved = jest
        .spyOn(app.get(SourceCredentialInjectorService), 'previewBoundConfig')
        .mockImplementation(() => {
          throw new BadRequestException('reached the preview');
        });

      const res = await preview(config, dataMartId, OTHER_AUTH_HEADER);

      expect(resolved).toHaveBeenCalledWith(
        expect.not.objectContaining({ _credential_id: expect.anything() }),
        'GoogleSheets',
        expect.objectContaining({ credentialId })
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('reached the preview');
      resolved.mockRestore();
    });

    it('names the deleted Credential of a bound configuration for its editor', async () => {
      const { credentialId, dataMartId, config } = await givenBoundSheets(false, true);
      await dataSource.getRepository(Credential).softDelete({ id: credentialId });

      const res = await preview(
        { ...config, _credential_id: credentialId },
        dataMartId,
        OTHER_AUTH_HEADER
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        "This Data Mart's Credential was deleted. Select another Credential for this Data Mart."
      );
    });
  });
});
