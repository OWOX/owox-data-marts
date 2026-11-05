import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { IdpProvider, McpScope, Role } from '@owox/idp-protocol';
import { closeTestApp, createTestApp, StorageBuilder } from '@owox/test-utils';
import { DataSource } from 'typeorm';
import { IdpProviderService } from '../src/idp/services/idp-provider.service';
import { DataMart } from '../src/data-marts/entities/data-mart.entity';
import { DataMartRun } from '../src/data-marts/entities/data-mart-run.entity';
import { ConnectorSourceCredentials } from '../src/data-marts/entities/connector-source-credentials.entity';
import { DataMartDefinitionType } from '../src/data-marts/enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../src/data-marts/enums/data-mart-status.enum';
import { DataMartDefinitionValidatorFacade } from '../src/data-marts/data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataMartSchemaProviderFacade } from '../src/data-marts/data-storage-types/facades/data-mart-schema-provider.facade';
import { LegacyDataMartsService } from '../src/data-marts/services/legacy-data-marts/legacy-data-marts.service';
import { serviceAccountKey } from './fixtures/google-service-account-key';
import { createCredential } from './fixtures/storage-credentials';

const browser = { 'x-owox-authorization': 'management-test' };
const secret = 'private-connector-value-7136';

describe('Data Mart management through MCP', () => {
  let app: INestApplication;
  let agent: Awaited<ReturnType<typeof createTestApp>>['agent'];
  let database: DataSource;
  let baseUrl: URL;
  let projectId = '0';
  let userId = '1';
  let roles: Role[] = ['admin'];
  let scopes: McpScope[] = ['mcp:read', 'mcp:write'];
  let storageId: string;
  let connectorSequence = 0;
  const clients: Client[] = [];
  const environment = {
    OWOX_AUTH_PUBLIC_BASE_URL: process.env.OWOX_AUTH_PUBLIC_BASE_URL,
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
    MCP_PUBLIC_BASE_URL: process.env.MCP_PUBLIC_BASE_URL,
    SCHEDULER_EXECUTION_ENABLED: process.env.SCHEDULER_EXECUTION_ENABLED,
  };

  beforeAll(async () => {
    process.env.OWOX_AUTH_PUBLIC_BASE_URL = 'https://app.owox.com';
    process.env.PUBLIC_ORIGIN = 'https://app.owox.com';
    process.env.SCHEDULER_EXECUTION_ENABLED = 'false';
    // Substitute warehouse validation and schema discovery; retain real use cases and persistence.
    ({ app, agent } = await createTestApp([
      {
        provide: DataMartDefinitionValidatorFacade,
        useValue: { validate: async () => ({ valid: true }), checkIsValid: async () => undefined },
      },
      {
        provide: DataMartSchemaProviderFacade,
        useValue: {
          getActualDataMartSchema: async () => ({
            type: 'bigquery-data-mart-schema',
            fields: [{ name: 'value', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' }],
          }),
        },
      },
    ]));
    database = app.get(DataSource);
    const provider = app.get(IdpProviderService).getProviderFromApp();
    const payload = () => ({
      projectId,
      userId,
      roles,
      email: 'owner@example.test',
      fullName: 'Owner',
    });
    jest.spyOn(provider, 'parseToken').mockImplementation(async () => payload());
    jest.spyOn(provider, 'introspectToken').mockImplementation(async () => payload());
    jest.spyOn(provider, 'getProjectMembers').mockResolvedValue([
      {
        userId: '1',
        email: 'owner@example.test',
        fullName: 'Owner',
        projectRole: 'admin',
        userStatus: 'active',
        hasNotificationsEnabled: true,
        isOutbound: false,
      },
      {
        userId: '2',
        email: 'viewer@example.test',
        fullName: 'Viewer',
        projectRole: 'viewer',
        userStatus: 'active',
        hasNotificationsEnabled: true,
        isOutbound: false,
      },
    ]);
    jest.spyOn(provider, 'verifyMcpAccessToken').mockImplementation(
      async (_token, resource) =>
        ({
          clientId: 'data-mart-management-test',
          projectId,
          userId,
          roles,
          scopes,
          resource,
          authFlow: 'mcp',
        }) as Awaited<ReturnType<IdpProvider['verifyMcpAccessToken']>>
    );
    const storage = await agent
      .post('/api/data-storages')
      .set(browser)
      .send(new StorageBuilder().build());
    expect(storage.status).toBe(201);
    storageId = storage.body.id;
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    process.env.MCP_PUBLIC_BASE_URL = `http://127.0.0.1:${port}`;
    baseUrl = new URL(`http://127.0.0.1:${port}/mcp`);
  }, 120_000);

  beforeEach(() => {
    projectId = '0';
    userId = '1';
    roles = ['admin'];
    scopes = ['mcp:read', 'mcp:write'];
  });
  afterEach(async () => {
    for (const client of clients.splice(0)) await client.close();
  });
  afterAll(async () => {
    if (app) await closeTestApp(app);
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function connect(era: 'legacy' | 'modern' = 'modern') {
    const client = new Client(
      { name: 'data-mart-management-test', version: '1' },
      era === 'modern' ? { versionNegotiation: { mode: 'auto' } } : undefined
    );
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(baseUrl, {
        authProvider: { token: async () => 'mcp-token' } as never,
      })
    );
    return client;
  }
  async function call(client: Client, name: string, input: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: input });
    expect(result).not.toMatchObject({ isError: true });
    expect(JSON.stringify(result)).not.toContain(secret);
    return result.structuredContent as Record<string, unknown>;
  }
  async function draft(client: Client) {
    return String(
      (await call(client, 'create_data_mart', { storage_id: storageId, title: 'MCP Orders' }))
        .data_mart_id
    );
  }

  async function publicObjectConnector(client: Client) {
    const name = `PublicObjectRegression${++connectorSequence}`;
    const manifest = {
      version: '1.0',
      name,
      baseUrl: 'https://api.example.com',
      parameters: {
        Username: { requiredType: 'string' },
        Password: { requiredType: 'string' },
        PublicFilter: { requiredType: 'object', attributes: ['MANUAL_BACKFILL'] },
      },
      authentication: {
        type: 'basic',
        username: '{{ parameters.Username }}',
        password: '{{ parameters.Password }}',
      },
      nodes: {
        items: {
          uniqueKeys: ['id'],
          request: { path: '/items', body: '{{ parameters.PublicFilter }}' },
          recordSelector: { recordPath: [] },
          fields: { id: { type: 'string' } },
        },
      },
    };
    const connector = await call(client, 'create_custom_connector', {
      name,
      title: 'Public object regression',
      manifest,
    });
    await call(client, 'publish_custom_connector', { connector_id: connector.connector_id });
    const credential = await agent
      .post('/api/credentials')
      .set(browser)
      .send({
        title: 'Custom connector source',
        definitionId: 'custom-connector',
        customConnector: {
          hosts: ['api.example.com'],
          fieldList: [
            { key: 'Username', label: 'Username', secret: false },
            { key: 'Password', label: 'Password', secret: true },
          ],
          fields: { Username: 'fixture-user', Password: secret },
        },
      })
      .expect(201);
    const id = await draft(client);
    const definition = {
      connector: {
        source: {
          name,
          version: 1,
          configuration: [
            {
              _credential_id: credential.body.id,
              PublicFilter: {
                Username: 'public-column-name',
                _id: 'public-record-id',
                _eq: 'public-filter',
                keep: true,
              },
            },
          ],
          node: 'items',
          fields: ['id'],
        },
        storage: { fullyQualifiedName: 'test_dataset.fixture' },
      },
    };
    await agent
      .put(`/api/data-marts/${id}/definition`)
      .set(browser)
      .send({ definitionType: 'CONNECTOR', definition })
      .expect(200);
    const stored = await database.getRepository(DataMart).findOneByOrFail({ id });
    expect(stored.definition).toMatchObject({
      connector: {
        source: {
          configuration: [
            {
              PublicFilter: {
                Username: 'public-column-name',
                _id: 'public-record-id',
                _eq: 'public-filter',
                keep: true,
              },
            },
          ],
        },
      },
    });
    return { id, definition: stored.definition };
  }

  it.each(['legacy', 'modern'] as const)(
    'registers management and connector tools over %s transport',
    async era => {
      const client = await connect(era);
      const catalog = await client.listTools();
      expect(catalog.tools.map(tool => tool.name)).toEqual(
        expect.arrayContaining([
          'create_data_mart',
          'get_data_mart_setup',
          'list_setup_data_marts',
          'update_data_mart_definition',
          'publish_data_mart',
          'run_data_mart',
          'list_data_mart_run_schedules',
          'list_connectors',
          'preview_connector_fields',
          'preview_data_mart',
        ])
      );
      for (const name of [
        'validate_data_mart',
        'publish_data_mart',
        'preview_data_mart',
        'update_data_mart_definition',
        'update_data_mart_run_schedule',
      ]) {
        const tool = catalog.tools.find(candidate => candidate.name === name);
        expect(tool).toMatchObject({
          annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
        });
        expect(tool?.annotations?.idempotentHint ?? false).toBe(false);
      }
      expect(catalog.tools.find(tool => tool.name === 'get_data_mart_setup')).toMatchObject({
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      });
    }
  );

  it('reads stored legacy setup without synchronization while HTTP retains legacy synchronization', async () => {
    const client = await connect();
    const template = await database.getRepository(DataMart).findOneByOrFail({
      id: await draft(client),
    });
    const id = 'a'.repeat(32);
    await database.getRepository(DataMart).save({
      id,
      title: 'Stored legacy SQL',
      storage: template.storage,
      projectId,
      createdById: userId,
      definitionType: DataMartDefinitionType.SQL,
      definition: { sqlQuery: 'SELECT 1 AS value' },
    });
    const before = await database.getRepository(DataMart).findOneByOrFail({ id });
    const remote = jest
      .spyOn(app.get(LegacyDataMartsService), 'getDataMartDetails')
      .mockRejectedValue(new NotFoundException('Legacy Data Mart no longer exists'));
    try {
      scopes = ['mcp:read'];
      expect(await call(client, 'get_data_mart_setup', { data_mart_id: id })).toMatchObject({
        title: 'Stored legacy SQL',
        definition: { sqlQuery: 'SELECT 1 AS value' },
      });
      expect(remote).not.toHaveBeenCalled();
      expect(await database.getRepository(DataMart).findOneByOrFail({ id })).toEqual(before);

      await agent.get(`/api/data-marts/${id}`).set(browser).expect(404);
      expect(remote).toHaveBeenCalledWith(id);
      const after = await database.getRepository(DataMart).findOneOrFail({
        where: { id },
        withDeleted: true,
      });
      expect(after.deletedAt).toBeInstanceOf(Date);
    } finally {
      remote.mockRestore();
    }
  });

  it('creates, configures, publishes and deletes the same Data Mart visible over HTTP', async () => {
    const client = await connect();
    const id = await draft(client);
    const target = { data_mart_id: id };
    expect(await call(client, 'get_data_mart_setup', target)).toMatchObject({
      status: 'DRAFT',
      definition: null,
      storage: { storage_id: storageId },
    });
    await call(client, 'update_data_mart_definition', {
      ...target,
      definition_type: 'SQL',
      definition: { sqlQuery: 'SELECT 1 AS value' },
    });
    await call(client, 'update_data_mart_title', { ...target, title: 'Orders ready for review' });
    await call(client, 'update_data_mart_description', { ...target, description: 'Order totals' });
    await call(client, 'update_data_mart_icon', { ...target, icon: 'orders' });
    expect(await call(client, 'validate_data_mart', target)).toMatchObject({ valid: true });
    expect(await call(client, 'actualize_data_mart_schema', target)).toMatchObject({
      schema: { fields: [expect.objectContaining({ name: 'value' })] },
    });
    expect(await call(client, 'publish_data_mart', target)).toMatchObject({ status: 'PUBLISHED' });
    const response = await agent.get(`/api/data-marts/${id}`).set(browser);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      title: 'Orders ready for review',
      description: 'Order totals',
      icon: 'orders',
      status: 'PUBLISHED',
      definition: { sqlQuery: 'SELECT 1 AS value' },
    });
    const page = await call(client, 'list_setup_data_marts', {
      storage_id: storageId,
      status: 'PUBLISHED',
    });
    expect(page.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ data_mart_id: id })])
    );
    expect(await call(client, 'get_data_mart_change_impact', target)).toMatchObject({
      reports_count: 0,
    });
    expect(await call(client, 'delete_data_mart', target)).toEqual({
      data_mart_id: id,
      deleted: true,
    });
    expect((await agent.get(`/api/data-marts/${id}`).set(browser)).status).toBe(404);
  });

  it('rejects unknown input through the SDK before any write', async () => {
    const client = await connect();
    const before = await database.getRepository(DataMart).count();
    const result = await client.callTool({
      name: 'create_data_mart',
      arguments: { storage_id: storageId, title: 'Rejected', project_id: 'other' },
    });
    expect(result.isError).toBe(true);
    expect(await database.getRepository(DataMart).count()).toBe(before);
  });

  it('uses the same secret rejection as HTTP when saving a connector definition', async () => {
    const client = await connect();
    const id = await draft(client);
    const definition = {
      connector: {
        source: {
          name: 'FacebookMarketing',
          configuration: [{ AccessToken: secret }],
          node: 'campaigns',
          fields: ['id'],
        },
        storage: { fullyQualifiedName: 'p.d.t' },
      },
    };
    const http = await agent
      .put(`/api/data-marts/${id}/definition`)
      .set(browser)
      .send({ definitionType: 'CONNECTOR', definition });
    expect(http.status).toBe(400);
    expect(http.body.message).toBe('This page is out of date. Reload it.');
    const result = await client.callTool({
      name: 'update_data_mart_definition',
      arguments: { data_mart_id: id, definition_type: 'CONNECTOR', definition },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('get_data_mart_setup');
    expect(JSON.stringify(result)).not.toContain('Reload it.');
    expect(JSON.stringify(result)).not.toContain(secret);
    expect((await database.getRepository(DataMart).findOneByOrFail({ id })).definition).toBeNull();
  });

  it('preserves accepted connector settings when setup output is saved as a replacement', async () => {
    const client = await connect();
    const id = await draft(client);
    const credentialId = await createCredential(app, {
      projectId,
      definitionId: 'google-service-account',
      title: 'Sheets source',
      secret: { value: serviceAccountKey() },
      publicMetadata: null,
      ownerIds: [userId],
      contextIds: [],
    });
    const settings = {
      SpreadsheetId: 'sheet-7136',
      HeaderRow: '2',
      InferTypes: true,
      AuthType: { service_account: {} },
      _credential_id: credentialId,
    };
    const definition = {
      connector: {
        source: {
          name: 'GoogleSheets',
          configuration: [settings],
          node: 'rows',
          fields: ['value'],
        },
        storage: { fullyQualifiedName: 'project.dataset.sheet_7136' },
      },
    };
    const saved = await agent
      .put(`/api/data-marts/${id}/definition`)
      .set(browser)
      .send({ definitionType: 'CONNECTOR', definition });
    expect({ status: saved.status, body: saved.body }).toMatchObject({ status: 200 });
    const setup = await call(client, 'get_data_mart_setup', { data_mart_id: id });
    expect(setup.definition).toMatchObject({
      connector: { source: { configuration: [settings] } },
    });
    await call(client, 'update_data_mart_definition', {
      data_mart_id: id,
      definition_type: 'CONNECTOR',
      definition: setup.definition,
    });
    const reloaded = await agent.get(`/api/data-marts/${id}`).set(browser);
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.definition).toMatchObject({
      connector: { source: { configuration: [settings] } },
    });
  });

  it('preserves public nested authentication field names through MCP setup and replacement', async () => {
    const client = await connect();
    const { id, definition } = await publicObjectConnector(client);
    const setup = await call(client, 'get_data_mart_setup', { data_mart_id: id });
    expect(setup.definition).toMatchObject({
      connector: {
        source: {
          configuration: [
            {
              PublicFilter: {
                Username: 'public-column-name',
                _id: 'public-record-id',
                _eq: 'public-filter',
                keep: true,
              },
            },
          ],
        },
      },
    });
    expect(JSON.stringify(setup)).not.toContain('fixture-user');
    await call(client, 'update_data_mart_definition', {
      data_mart_id: id,
      definition_type: 'CONNECTOR',
      definition: setup.definition,
    });

    expect((await database.getRepository(DataMart).findOneByOrFail({ id })).definition).toEqual(
      definition
    );

    const replacement = structuredClone(setup.definition) as {
      connector: { source: { configuration: { PublicFilter: Record<string, unknown> }[] } };
    };
    delete replacement.connector.source.configuration[0].PublicFilter.Username;
    await call(client, 'update_data_mart_definition', {
      data_mart_id: id,
      definition_type: 'CONNECTOR',
      definition: replacement,
    });
    const reloaded = (await database.getRepository(DataMart).findOneByOrFail({ id }))
      .definition as typeof replacement;
    expect(reloaded.connector.source.configuration[0].PublicFilter).toEqual({
      _id: 'public-record-id',
      _eq: 'public-filter',
      keep: true,
    });
  });

  it.each(['HTTP', 'MCP'] as const)(
    'queues a manual run with public nested authentication field names through %s',
    async transport => {
      const client = await connect();
      const { id, definition } = await publicObjectConnector(client);
      // Seed publication without its automatic run. The scheduler stays disabled in this suite.
      await database.getRepository(DataMart).update(id, { status: DataMartStatus.PUBLISHED });
      const payload = {
        runType: 'MANUAL_BACKFILL',
        data: { PublicFilter: { Username: 'public-column-name' } },
      };
      let runId: string;
      if (transport === 'HTTP') {
        const response = await agent
          .post(`/api/data-marts/${id}/manual-run`)
          .set(browser)
          .send({ payload });
        expect({ status: response.status, body: response.body }).toMatchObject({ status: 201 });
        runId = response.body.runId;
      } else {
        const response = await call(client, 'run_data_mart', { data_mart_id: id, payload });
        expect(response).toMatchObject({ data_mart_id: id, status: 'queued' });
        runId = String(response.run_id);
      }

      const runs = await database.getRepository(DataMartRun).findBy({ dataMartId: id });
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        id: runId,
        status: 'PENDING',
        definitionRun: definition,
        additionalParams: { payload },
      });
      expect((await database.getRepository(DataMart).findOneByOrFail({ id })).definition).toEqual(
        definition
      );
    }
  );

  it.each(['oauth', 'secrets'] as const)(
    'preserves unbound legacy %s credentials across MCP and HTTP replacements',
    async mode => {
      const client = await connect();
      const id = await draft(client);
      const connectorName = mode === 'oauth' ? 'FacebookMarketing' : 'Shopify';
      const legacyKeys = database.getRepository(ConnectorSourceCredentials);
      const legacy = await legacyKeys.save(
        legacyKeys.create({
          projectId,
          dataMartId: id,
          configId: 'legacy-config',
          connectorName,
          credentials: mode === 'oauth' ? { accessToken: secret } : { AccessToken: secret },
        })
      );
      const settings =
        mode === 'oauth'
          ? {
              _id: 'legacy-config',
              AuthType: { oauth2: { AppId: 'legacy-app-7136', _source_credential_id: legacy.id } },
              AccountIDs: 'account-7136',
            }
          : {
              _id: 'legacy-config',
              _secrets_id: legacy.id,
              ShopDomain: 'legacy-shop-7136.myshopify.com',
              Fields: 'orders id',
            };
      const definition = {
        connector: {
          source: {
            name: connectorName,
            configuration: [settings],
            node: mode === 'oauth' ? 'campaigns' : 'orders',
            fields: ['id'],
          },
          storage: { fullyQualifiedName: 'project.dataset.legacy_7136' },
        },
      };
      // Seed the supported pre-migration state: no reusable Credential binding.
      const seeded = await database.getRepository(DataMart).findOneByOrFail({ id });
      seeded.definitionType = DataMartDefinitionType.CONNECTOR;
      seeded.definition = definition;
      await database.getRepository(DataMart).save(seeded);
      for (const transport of ['mcp', 'http']) {
        const setup = await call(client, 'get_data_mart_setup', { data_mart_id: id });
        expect(setup.definition_read_error).toBeNull();
        expect(JSON.stringify(setup)).not.toContain(legacy.id);
        expect(JSON.stringify(setup)).not.toContain('legacy-app-7136');
        expect(JSON.stringify(setup)).not.toContain('legacy-shop-7136');
        const replacement = setup.definition as typeof definition;
        replacement.connector.source.fields = ['id', 'name'];
        if (transport === 'mcp') {
          await call(client, 'update_data_mart_definition', {
            data_mart_id: id,
            definition_type: 'CONNECTOR',
            definition: replacement,
          });
        } else {
          const saved = await agent
            .put(`/api/data-marts/${id}/definition`)
            .set(browser)
            .send({ definitionType: 'CONNECTOR', definition: replacement });
          expect({ status: saved.status, body: saved.body }).toMatchObject({ status: 200 });
        }
        const saved = await database.getRepository(DataMart).findOneByOrFail({ id });
        expect(saved.definition).toEqual({
          connector: {
            ...definition.connector,
            source: { ...definition.connector.source, fields: ['id', 'name'] },
          },
        });
        expect((await legacyKeys.findOneByOrFail({ id: legacy.id })).credentials).toEqual(
          legacy.credentials
        );
      }
    }
  );

  it('keeps setup available when a connector is missing and never returns a partial replacement', async () => {
    const client = await connect();
    const id = await draft(client);
    const definition = {
      connector: {
        source: {
          name: 'MissingConnector7136',
          configuration: [{ _id: 'legacy-config', UnknownToken: secret }],
          node: 'orders',
          fields: ['id'],
        },
        storage: { fullyQualifiedName: 'project.dataset.unavailable_7136' },
      },
    };
    const seeded = await database.getRepository(DataMart).findOneByOrFail({ id });
    seeded.definitionType = DataMartDefinitionType.CONNECTOR;
    seeded.definition = definition;
    await database.getRepository(DataMart).save(seeded);
    expect((await agent.get(`/api/data-marts/${id}`).set(browser)).status).toBe(200);
    const setup = await call(client, 'get_data_mart_setup', { data_mart_id: id });
    expect(setup).toMatchObject({
      title: 'MCP Orders',
      definition: null,
      storage: { storage_id: storageId },
    });
    expect(setup.definition_read_error).toContain('could not be read safely');
    const replacement = await client.callTool({
      name: 'update_data_mart_definition',
      arguments: { data_mart_id: id, definition_type: 'CONNECTOR', definition: setup.definition },
    });
    expect(replacement.isError).toBe(true);
    expect((await database.getRepository(DataMart).findOneByOrFail({ id })).definition).toEqual(
      definition
    );
    await call(client, 'update_data_mart_title', { data_mart_id: id, title: 'Repair source' });
    expect((await agent.get(`/api/data-marts/${id}`).set(browser)).body.title).toBe(
      'Repair source'
    );
  });

  it('preserves HTTP SEE access for viewers while rejecting editor-only mutations', async () => {
    const admin = await connect();
    const id = await draft(admin);
    await call(admin, 'update_data_mart_definition', {
      data_mart_id: id,
      definition_type: 'SQL',
      definition: { sqlQuery: 'SELECT 1' },
    });
    await call(admin, 'publish_data_mart', { data_mart_id: id });
    roles = ['viewer'];
    userId = '2';
    const viewer = await connect();
    const http = await agent.get(`/api/data-marts/${id}`).set(browser);
    expect(http.status).toBe(200);
    expect(await call(viewer, 'get_data_mart_setup', { data_mart_id: id })).toMatchObject({
      definition: http.body.definition,
    });
    expect(
      (await clientCall(viewer, 'update_data_mart_title', { data_mart_id: id, title: 'Denied' }))
        .isError
    ).toBe(true);
    expect(
      (await agent.put(`/api/data-marts/${id}/title`).set(browser).send({ title: 'Denied' })).status
    ).toBe(403);
  });

  it('enforces entity access and project boundaries in the shared use cases', async () => {
    const admin = await connect();
    const id = await draft(admin);
    await call(admin, 'set_data_mart_sharing', {
      data_mart_id: id,
      available_for_reporting: false,
      available_for_maintenance: false,
    });
    roles = ['editor'];
    userId = '2';
    const editor = await connect();
    expect(
      (await clientCall(editor, 'update_data_mart_title', { data_mart_id: id, title: 'Denied' }))
        .isError
    ).toBe(true);
    expect(
      (await agent.put(`/api/data-marts/${id}/title`).set(browser).send({ title: 'Denied' })).status
    ).toBe(403);
    projectId = 'other';
    roles = ['admin'];
    const other = await connect();
    expect((await clientCall(other, 'get_data_mart_setup', { data_mart_id: id })).isError).toBe(
      true
    );
    expect((await agent.get(`/api/data-marts/${id}`).set(browser)).status).toBe(404);
  });

  it('requires write scope even for a project admin', async () => {
    scopes = ['mcp:read'];
    const client = await connect();
    expect(
      (await clientCall(client, 'create_data_mart', { storage_id: storageId, title: 'Denied' }))
        .isError
    ).toBe(true);
  });

  async function clientCall(client: Client, name: string, input: Record<string, unknown>) {
    return client.callTool({ name, arguments: input });
  }
});
