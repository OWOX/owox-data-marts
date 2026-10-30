import { INestApplication } from '@nestjs/common';
import { closeTestApp, createTestApp } from '@owox/test-utils';
import * as crypto from 'crypto';
import { DataSource, type MigrationInterface } from 'typeorm';
import { CustomLoggerService } from '../src/common/logger/logger.service';
import { sourceCredentialRequirement } from '../src/data-marts/connector-types/source-credential-state';
import { requirementRevision } from '../src/data-marts/credentials/services/credential-requirement-revision';
import { ConnectorCredentialInjectorService } from '../src/data-marts/services/connector/connector-credential-injector.service';
import { SourceCredentialInjectorService } from '../src/data-marts/services/connector/source-credential-injector.service';
import { SOURCES_ON_OLD_KEY_SQL } from '../src/data-marts/services/source-credential-conversion/legacy-source-credential-sql';
import { ConvertSourceCredentials1793000000000 } from '../src/migrations/1793000000000-convert-source-credentials';
import { createCredential } from './fixtures/storage-credentials';

const PROJECT = 'project-1';
const EXPIRES_AT = '2026-12-01T00:00:00.000Z';

type Config = Record<string, unknown>;

interface DataMartSeed {
  connector: string;
  configuration: Config[];
  version?: number;
  title?: string;
  technicalOwners?: string[];
  businessOwners?: string[];
  contexts?: string[];
  createdAt?: string;
}

/** A bearer manifest whose requests go to `host`. */
function bearerManifest(host: string, extra: Record<string, unknown> = {}) {
  return {
    version: '1.0',
    name: 'AcmeApi',
    baseUrl: `https://${host}/v1`,
    authentication: {
      type: 'bearer',
      inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ parameters.Token }}' },
    },
    parameters: { Token: { requiredType: 'string', isRequired: true, label: 'API token' } },
    nodes: {
      items: {
        destinationName: 'items',
        isTimeSeries: false,
        uniqueKeys: ['id'],
        fields: { id: { type: 'string' } },
        request: { method: 'GET', path: '/items' },
        recordSelector: { recordPath: ['data'] },
        ...extra,
      },
    },
  };
}

describe('Source key conversion migration (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const contexts: string[] = [];

  beforeAll(async () => {
    app = (await createTestApp()).app;
    dataSource = app.get(DataSource);
    for (const name of ['c1', 'c2', 'c3']) {
      const id = crypto.randomUUID();
      await dataSource.query(
        `INSERT INTO context (id, name, projectId, createdAt, modifiedAt)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, name, PROJECT]
      );
      contexts.push(id);
    }
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function rows(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    return dataSource.query(sql, params);
  }

  /** A connector Data Mart as release N-1 stored it. */
  async function givenDataMart(seed: DataMartSeed): Promise<string> {
    const id = crypto.randomUUID();
    const definition = {
      connector: {
        source: {
          name: seed.connector,
          configuration: seed.configuration,
          node: 'items',
          fields: ['id'],
          ...(seed.version !== undefined && { version: seed.version }),
        },
        storage: { fullyQualifiedName: 'dataset.items' },
      },
    };
    await dataSource.query(
      `INSERT INTO data_mart (id, title, definitionType, definition, projectId, createdById, createdAt, modifiedAt)
       VALUES (?, ?, 'CONNECTOR', ?, ?, 'creator-1', COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)`,
      [id, seed.title ?? 'Sales', JSON.stringify(definition), PROJECT, seed.createdAt ?? null]
    );
    for (const userId of seed.technicalOwners ?? ['tech-1']) {
      await dataSource.query(
        'INSERT INTO data_mart_technical_owners (data_mart_id, user_id) VALUES (?, ?)',
        [id, userId]
      );
    }
    for (const userId of seed.businessOwners ?? []) {
      await dataSource.query(
        'INSERT INTO data_mart_business_owners (data_mart_id, user_id) VALUES (?, ?)',
        [id, userId]
      );
    }
    for (const contextId of seed.contexts ?? []) {
      await dataSource.query(
        'INSERT INTO data_mart_contexts (data_mart_id, context_id) VALUES (?, ?)',
        [id, contextId]
      );
    }
    return id;
  }

  async function givenOldRow(
    connectorName: string,
    credentials: Record<string, unknown>,
    oauth?: { userId: string; user: Record<string, unknown> }
  ): Promise<string> {
    const id = crypto.randomUUID();
    await dataSource.query(
      `INSERT INTO connector_source_credentials (id, projectId, userId, connectorName, credentials, user, expiresAt, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        id,
        PROJECT,
        oauth?.userId ?? null,
        connectorName,
        JSON.stringify(credentials),
        oauth ? JSON.stringify(oauth.user) : null,
        oauth ? EXPIRES_AT.replace('T', ' ').replace('Z', '') : null,
      ]
    );
    return id;
  }

  /** A custom connector with published versions 1.., the active one last. */
  async function givenCustomConnector(name: string, manifests: object[]): Promise<void> {
    const definitionId = crypto.randomUUID();
    const versionIds = manifests.map(() => crypto.randomUUID());
    await dataSource.query(
      `INSERT INTO connector_definition (id, projectId, name, title, activeVersionId, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [definitionId, PROJECT, name, 'Acme API', versionIds.at(-1)]
    );
    for (const [index, manifest] of manifests.entries()) {
      await dataSource.query(
        `INSERT INTO connector_definition_version (id, connectorDefinitionId, version, manifest, status, createdAt, publishedAt)
         VALUES (?, ?, ?, ?, 'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [versionIds[index], definitionId, index + 1, JSON.stringify(manifest)]
      );
    }
  }

  async function migrate(direction: 'up' | 'down'): Promise<void> {
    const queryRunner = dataSource.createQueryRunner();
    try {
      const migration: MigrationInterface = new ConvertSourceCredentials1793000000000();
      await migration[direction](queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  const convert = () => migrate('up');

  function bindingsOf(dataMartId: string): Promise<Record<string, unknown>[]> {
    return rows('SELECT * FROM credential_consumer_binding WHERE consumerId = ?', [dataMartId]);
  }

  async function credentialOf(dataMartId: string) {
    const [binding] = await bindingsOf(dataMartId);
    const [credential] = await rows('SELECT * FROM credential WHERE id = ?', [
      binding.credentialId,
    ]);
    const owners = await rows(
      'SELECT user_id FROM credential_owners WHERE credential_id = ? ORDER BY user_id',
      [credential.id]
    );
    const linked = await rows(
      'SELECT context_id FROM credential_contexts WHERE credential_id = ?',
      [credential.id]
    );
    return {
      ...credential,
      secret: JSON.parse(credential.secret as string),
      publicMetadata: JSON.parse(credential.publicMetadata as string),
      owners: owners.map(row => row.user_id),
      contexts: linked.map(row => row.context_id),
    };
  }

  /** What a run on N reads for the configuration, next to what a run on N-1 read from the old rows. */
  async function runConfigs(dataMartId: string, connector: string, config: Config) {
    const injector = app.get(ConnectorCredentialInjectorService);
    const bound = await app
      .get(SourceCredentialInjectorService)
      .resolveBoundConfig(PROJECT, dataMartId, connector, config._id as string, config, null);
    const old = await injector.injectOAuthCredentials(
      await injector.injectSecrets(config, PROJECT, connector),
      connector,
      PROJECT
    );
    return { bound: bound?.config, old };
  }

  it('converts secret rows, a shared OAuth row and a custom connector row into Not shared Credentials that runs read', async () => {
    const [c1, c2, c3] = contexts;
    const secretsId = await givenOldRow('Shopify', { AccessToken: 'shpat-1' });
    const shopifyConfig = {
      _id: 'shop-1',
      _secrets_id: secretsId,
      ShopDomain: 'acme.myshopify.com',
    };
    const shopify = await givenDataMart({
      connector: 'Shopify',
      configuration: [shopifyConfig],
      title: 'Orders',
      technicalOwners: ['tech-1'],
      businessOwners: ['business-1'],
      contexts: [c1, c2],
    });

    const oauthId = await givenOldRow(
      'LinkedInAds',
      {
        refresh_token: 'refresh-1',
        access_token: 'access-1',
        client_id: 'client-1',
        client_secret: 'secret-1',
      },
      { userId: 'member-1', user: { id: 'unknown', name: 'LinkedIn Ads User' } }
    );
    const linkedInConfig = (id: string) => ({
      _id: id,
      AuthType: { oauth2: { _source_credential_id: oauthId } },
      AccountIDs: '1',
    });
    const leads = await givenDataMart({
      connector: 'LinkedInAds',
      configuration: [linkedInConfig('leads-1')],
      title: 'Leads',
      createdAt: '2026-01-01 00:00:00',
      contexts: [c1, c2],
    });
    const campaigns = await givenDataMart({
      connector: 'LinkedInAds',
      configuration: [linkedInConfig('campaigns-1')],
      title: 'Campaigns',
      createdAt: '2026-01-01 00:00:01',
      technicalOwners: [],
      businessOwners: ['business-2'],
      contexts: [c2, c3],
    });

    await givenCustomConnector('AcmeApi', [
      bearerManifest('v1.acme.example'),
      bearerManifest('v2.acme.example'),
    ]);
    const customSecrets = await givenOldRow('AcmeApi', { Token: 'acme-token-1' });
    const pinned = await givenDataMart({
      connector: 'AcmeApi',
      configuration: [{ _id: 'acme-1', _secrets_id: customSecrets }],
      version: 1,
      title: 'Acme items',
    });

    await convert();

    const requirement = sourceCredentialRequirement();
    const [shopifyBinding] = await bindingsOf(shopify);
    expect(shopifyBinding).toMatchObject({
      projectId: PROJECT,
      consumerType: 'connector-config',
      requirementKey: 'shop-1',
      requirementRevision: requirementRevision(requirement),
      configuredById: null,
      active: 1,
    });
    expect(JSON.parse(shopifyBinding.requirementSnapshot as string)).toEqual(requirement);
    expect(await credentialOf(shopify)).toMatchObject({
      projectId: PROJECT,
      title: 'Shopify — Orders',
      definitionSource: 'builtin',
      definitionId: 'source:Shopify:default',
      enabled: 1,
      availableForUse: 0,
      availableForMaintenance: 0,
      validationState: 'unknown',
      createdById: null,
      deletedAt: null,
      secret: { fields: { AccessToken: 'shpat-1' } },
      publicMetadata: { fields: { ShopDomain: 'acme.myshopify.com' } },
      owners: ['tech-1'],
      contexts: expect.arrayContaining([c1, c2]),
    });
    const shopifyRun = await runConfigs(shopify, 'Shopify', shopifyConfig);
    expect(shopifyRun.bound).toEqual(shopifyRun.old);

    const [leadsBinding] = await bindingsOf(leads);
    const [campaignsBinding] = await bindingsOf(campaigns);
    expect(campaignsBinding.credentialId).toBe(leadsBinding.credentialId);
    expect(campaignsBinding.requirementKey).toBe('campaigns-1');
    expect(await credentialOf(leads)).toMatchObject({
      title: 'LinkedIn Ads — Leads',
      definitionId: 'source:LinkedInAds:oauth2',
      availableForUse: 0,
      availableForMaintenance: 0,
      secret: {
        fields: { RefreshToken: 'refresh-1', ClientSecret: 'secret-1', AccessToken: 'access-1' },
      },
      publicMetadata: {
        fields: { ClientId: 'client-1' },
        connection: { account: null, expiresAt: EXPIRES_AT },
      },
      owners: ['member-1'],
      contexts: [c2],
    });
    const leadsRun = await runConfigs(leads, 'LinkedInAds', linkedInConfig('leads-1'));
    expect(leadsRun.bound).toEqual(leadsRun.old);

    expect(await credentialOf(pinned)).toMatchObject({
      title: 'Acme API — Acme items',
      definitionId: 'custom-connector',
      availableForUse: 0,
      availableForMaintenance: 0,
      secret: { fields: { Token: 'acme-token-1' } },
      publicMetadata: {
        // The version the Data Mart is pinned to, not the active one.
        hosts: ['v1.acme.example'],
        fieldList: [{ key: 'Token', label: 'API token', secret: true }],
        fields: {},
      },
      owners: ['tech-1'],
    });
  });

  it('keeps configurations it cannot convert on their old key, logs why and lists them as on the old key', async () => {
    const warn = jest.spyOn(CustomLoggerService.prototype, 'warn');
    await givenCustomConnector('MisusingApi', [
      bearerManifest('api.misuse.example', {
        transformations: [{ type: 'add', field: 'key', value: '{{ parameters.Token }}' }],
      }),
    ]);
    const misusing = await givenDataMart({
      connector: 'MisusingApi',
      configuration: [
        { _id: 'misuse-1', _secrets_id: await givenOldRow('MisusingApi', { Token: 'leaked-1' }) },
      ],
    });
    const unknown = await givenDataMart({
      connector: 'GoneApi',
      configuration: [
        { _id: 'gone-1', _secrets_id: await givenOldRow('GoneApi', { Token: 'leaked-2' }) },
      ],
    });
    const converted = await givenDataMart({
      connector: 'GitHub',
      configuration: [
        { _id: 'github-1', _secrets_id: await givenOldRow('GitHub', { AccessToken: 'ghp-1' }) },
      ],
    });

    await convert();

    expect(warn).toHaveBeenCalledWith(
      `Data Mart ${misusing} configuration misuse-1 keeps its old key: the manifest uses a key parameter in transformations.add of node items`
    );
    expect(warn).toHaveBeenCalledWith(
      `Data Mart ${unknown} configuration gone-1 keeps its old key: unknown connector`
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('leaked');
    expect(await bindingsOf(misusing)).toEqual([]);
    expect(await bindingsOf(unknown)).toEqual([]);
    expect(await bindingsOf(converted)).toHaveLength(1);
    const onOldKey = (await rows(SOURCES_ON_OLD_KEY_SQL)).map(row => row.id);
    expect(onOldKey).toEqual(expect.arrayContaining([misusing, unknown]));
    expect(onOldKey).not.toContain(converted);
  });

  it('lists a Data Mart whose other configuration is converted as still on the old key', async () => {
    const partly = await givenDataMart({
      connector: 'GitHub',
      configuration: [
        { _id: 'kept-1', _secrets_id: 'missing-row' },
        { _id: 'moved-1', _secrets_id: await givenOldRow('GitHub', { AccessToken: 'ghp-2' }) },
      ],
    });

    await convert();

    expect(await bindingsOf(partly)).toEqual([
      expect.objectContaining({ requirementKey: 'moved-1' }),
    ]);
    expect((await rows(SOURCES_ON_OLD_KEY_SQL)).map(row => row.id)).toContain(partly);
  });

  it('binds a configuration whose _source_credential_id already names a Credential of its connector', async () => {
    const credentialId = await createCredential(app, {
      projectId: PROJECT,
      definitionId: 'source:LinkedInAds:oauth2',
      title: 'Connected mid-release',
      secret: { fields: { ClientSecret: 'secret-2', RefreshToken: 'refresh-2' } },
      publicMetadata: { fields: { ClientId: 'client-2' } },
      ownerIds: ['tech-1'],
      contextIds: [],
    });
    const dataMartId = await givenDataMart({
      connector: 'LinkedInAds',
      configuration: [
        { _id: 'named-1', AuthType: { oauth2: { _source_credential_id: credentialId } } },
      ],
    });
    const credentials = await rows('SELECT COUNT(*) AS n FROM credential');

    await convert();

    expect(await bindingsOf(dataMartId)).toEqual([
      expect.objectContaining({ credentialId, requirementKey: 'named-1', active: 1 }),
    ]);
    expect(await rows('SELECT COUNT(*) AS n FROM credential')).toEqual(credentials);
  });

  it('changes nothing when it runs again, and down() changes no data', async () => {
    await givenDataMart({
      connector: 'GitHub',
      configuration: [
        { _id: 'again-1', _secrets_id: await givenOldRow('GitHub', { AccessToken: 'ghp-3' }) },
      ],
    });
    await convert();
    const written = () =>
      Promise.all(
        [
          'SELECT * FROM credential ORDER BY id',
          'SELECT * FROM credential_owners ORDER BY credential_id, user_id',
          'SELECT * FROM credential_contexts ORDER BY credential_id, context_id',
          'SELECT * FROM credential_consumer_binding ORDER BY id',
          'SELECT * FROM connector_source_credentials ORDER BY id',
          'SELECT id, definition FROM data_mart ORDER BY id',
        ].map(sql => rows(sql))
      );
    const before = await written();

    await convert();
    await migrate('down');

    expect(await written()).toEqual(before);
  });
});
