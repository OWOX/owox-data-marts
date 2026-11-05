import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { IdpProvider, McpScope, Payload, Role } from '@owox/idp-protocol';
import { closeTestApp, createTestApp, DataMartBuilder } from '@owox/test-utils';
import { DataSource } from 'typeorm';
import { DataStorage } from '../src/data-marts/entities/data-storage.entity';
import { DataDestination } from '../src/data-marts/entities/data-destination.entity';
import { DataDestinationCredential } from '../src/data-marts/entities/data-destination-credential.entity';
import { Report } from '../src/data-marts/entities/report.entity';
import { IdpProviderService } from '../src/idp/services/idp-provider.service';
import { Credential } from '../src/data-marts/credentials/entities/credential.entity';
import { DataStorageAccessValidatorFacade } from '../src/data-marts/data-storage-types/facades/data-storage-access-validator-facade.service';
import { StorageResourceBrowserFacade } from '../src/data-marts/data-storage-types/facades/storage-resource-browser.facade';
import { ValidationResult } from '../src/data-marts/data-storage-types/interfaces/data-storage-access-validator.interface';
import { createCredential } from './fixtures/storage-credentials';
import {
  boundDestinationCredentialId,
  CHAT_WEBHOOK_URL,
  createChatWebhookCredential,
  createServiceAccountCredential,
} from './fixtures/destination-credentials';
import { GoogleSheetsFolderValidator } from '../src/data-marts/data-destination-types/google-sheets/services/google-sheets-folder-validator.service';
import { DestinationFolderAccessException } from '../src/data-marts/exceptions/google-oauth.exceptions';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';

const browser = { 'x-owox-authorization': 'resource-owner' };
const secret = 'resource-secret-must-not-reach-the-agent';

describe('Storage and Destination management through MCP', () => {
  let app: INestApplication;
  let agent: Awaited<ReturnType<typeof createTestApp>>['agent'];
  let database: DataSource;
  let baseUrl: URL;
  let projectId = '0';
  let userId = '1';
  let scopes: McpScope[] = ['mcp:read', 'mcp:write'];
  let roles: Role[] = ['admin'];
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
    // Keep background jobs out of the SQL query count.
    process.env.SCHEDULER_EXECUTION_ENABLED = 'false';
    ({ app, agent } = await createTestApp());
    database = app.get(DataSource);
    const provider = app.get(IdpProviderService).getProviderFromApp();
    const browserPayload: Payload = {
      userId: '1',
      projectId: '0',
      roles: ['admin'],
      email: 'owner@example.test',
      fullName: 'Owner',
    };
    jest.spyOn(provider, 'parseToken').mockResolvedValue(browserPayload);
    jest.spyOn(provider, 'introspectToken').mockResolvedValue(browserPayload);
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
          clientId: 'resource-management-test',
          projectId,
          userId,
          roles,
          scopes,
          resource,
          authFlow: 'mcp',
        }) as Awaited<ReturnType<IdpProvider['verifyMcpAccessToken']>>
    );
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

  async function connect(era: 'legacy' | 'modern') {
    const client = new Client(
      { name: 'resource-management-test', version: '1' },
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

  async function denied(client: Client, name: string, input: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: input });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secret);
    return result;
  }

  it.each(['legacy', 'modern'] as const)(
    'registers the complete resource catalog over %s MCP',
    async era => {
      const client = await connect(era);
      const { tools } = await client.listTools();
      expect(tools.map(tool => tool.name)).toEqual(
        expect.arrayContaining([
          'list_storages',
          'get_storage',
          'create_storage',
          'update_storage',
          'set_storage_access',
          'validate_storage_access',
          'list_storage_resources',
          'delete_storage',
          'list_destinations',
          'add_destination',
          'get_destination',
          'update_destination',
          'set_destination_access',
          'get_destination_impact',
          'delete_destination',
          'rotate_destination_secret_key',
        ])
      );
    }
  );

  it('explains provider permissions when an authorized user cannot list Storage resources', async () => {
    const storageId = randomUUID();
    const repository = database.getRepository(DataStorage);
    await repository.insert({
      id: storageId,
      projectId: '0',
      title: 'Shared warehouse',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'cloud-project', location: 'US' },
      createdById: '1',
      availableForUse: true,
      availableForMaintenance: false,
    });
    const listNamespaces = jest
      .spyOn(app.get(StorageResourceBrowserFacade), 'listNamespaces')
      .mockRejectedValue(Object.assign(new Error(secret), { code: 403 }));
    try {
      userId = '2';
      roles = ['editor'];
      const client = await connect('modern');
      const result = await client.callTool({
        name: 'list_storage_resources',
        arguments: { storage_id: storageId, level: 'namespaces' },
      });
      expect(listNamespaces).toHaveBeenCalledWith(expect.objectContaining({ id: storageId }));
      expect(result.isError).toBe(true);
      const output = JSON.stringify(result);
      expect(output).toContain('permission to use this Storage');
      expect(output).toContain('provider permissions');
      expect(output).not.toContain(secret);
    } finally {
      listNamespaces.mockRestore();
      await repository.delete(storageId);
    }
  });

  it('explains when Storage configuration is required before the next setup step', async () => {
    const client = await connect('modern');
    const credentialId = await createServiceAccountCredential(app, {
      projectId: '0',
      title: 'Storage setup account',
      ownerIds: ['1'],
      clientEmail: 'storage-setup@example.iam.gserviceaccount.com',
    });
    const { storage_id } = await call(client, 'create_storage', {
      storage_type: 'GOOGLE_BIGQUERY',
    });

    const binding = await denied(client, 'update_storage', {
      storage_id,
      credential_id: credentialId,
    });
    expect(JSON.stringify(binding)).toContain(
      'Set the Storage configuration before selecting a Credential.'
    );
    const browsing = await denied(client, 'list_storage_resources', {
      storage_id,
      level: 'namespaces',
    });
    expect(JSON.stringify(browsing)).toContain('Configure this Storage before listing resources.');
    expect(await call(client, 'get_storage', { storage_id })).toMatchObject({
      configuration: null,
      credential: null,
    });
    await call(client, 'delete_storage', { storage_id });
  });

  it('lists namespaces and filtered resources without exposing extra provider fields', async () => {
    const storageId = randomUUID();
    const repository = database.getRepository(DataStorage);
    await repository.insert({
      id: storageId,
      projectId: '0',
      title: 'Shared warehouse',
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'cloud-project', location: 'US' },
      createdById: '1',
      availableForUse: true,
      availableForMaintenance: false,
    });
    const namespaces = [{ id: 'cloud-project', label: 'Cloud project', diagnostics: secret }];
    const resources = [
      {
        id: 'events_*',
        groupId: 'analytics',
        type: 'TABLE' as const,
        fullyQualifiedName: 'cloud-project.analytics.events_*',
        location: 'EU',
        locationMismatch: true,
        diagnostics: secret,
      },
    ];
    const provider = app.get(StorageResourceBrowserFacade);
    const listNamespaces = jest.spyOn(provider, 'listNamespaces').mockResolvedValue(namespaces);
    const listResources = jest.spyOn(provider, 'listLeafResources').mockResolvedValue(resources);
    try {
      userId = '2';
      roles = ['editor'];
      const client = await connect('modern');
      expect(
        await call(client, 'list_storage_resources', {
          storage_id: storageId,
          level: 'namespaces',
        })
      ).toEqual({
        storage_id: storageId,
        namespaces: [{ id: 'cloud-project', label: 'Cloud project' }],
      });
      expect(
        await call(client, 'list_storage_resources', {
          storage_id: storageId,
          level: 'resources',
          namespace_id: 'cloud-project',
          resource_type: 'TABLE_PATTERN',
        })
      ).toEqual({
        storage_id: storageId,
        resources: [
          {
            id: 'events_*',
            group_id: 'analytics',
            type: 'TABLE',
            fully_qualified_name: 'cloud-project.analytics.events_*',
            location: 'EU',
            location_mismatch: true,
          },
        ],
      });
      expect(listNamespaces).toHaveBeenCalledWith(expect.objectContaining({ id: storageId }));
      expect(listResources).toHaveBeenCalledWith(
        expect.objectContaining({ id: storageId }),
        'cloud-project',
        'TABLE_PATTERN'
      );
      roles = ['viewer'];
      await denied(client, 'list_storage_resources', {
        storage_id: storageId,
        level: 'namespaces',
      });
      expect(listNamespaces).toHaveBeenCalledTimes(1);
    } finally {
      listNamespaces.mockRestore();
      listResources.mockRestore();
      await repository.delete(storageId);
    }
  });

  it.each<{
    type: DataStorageType;
    configuration: Record<string, unknown>;
    definitionId: string;
    fields: Record<string, string>;
  }>([
    {
      type: DataStorageType.GOOGLE_BIGQUERY,
      configuration: { projectId: 'cloud-project', location: 'US' },
      definitionId: 'google-service-account',
      fields: {},
    },
    {
      type: DataStorageType.AWS_ATHENA,
      configuration: { region: 'us-east-1', outputBucket: 's3://query-results/' },
      definitionId: 'aws-access-key',
      fields: { accessKeyId: 'key-id', secretAccessKey: secret },
    },
    {
      type: DataStorageType.SNOWFLAKE,
      configuration: { account: 'org-account', warehouse: 'REPORTING', role: 'ANALYST' },
      definitionId: 'snowflake-password',
      fields: { username: 'analyst', password: secret },
    },
    {
      type: DataStorageType.AWS_REDSHIFT,
      configuration: {
        connectionType: 'SERVERLESS',
        region: 'us-east-1',
        database: 'analytics',
        workgroupName: 'reporting',
      },
      definitionId: 'aws-access-key',
      fields: { accessKeyId: 'key-id', secretAccessKey: secret },
    },
    {
      type: DataStorageType.AWS_REDSHIFT,
      configuration: {
        connectionType: 'PROVISIONED',
        region: 'us-east-1',
        database: 'analytics',
        clusterIdentifier: 'reporting',
      },
      definitionId: 'aws-access-key',
      fields: { accessKeyId: 'key-id', secretAccessKey: secret },
    },
    {
      type: DataStorageType.DATABRICKS,
      configuration: { host: 'warehouse.cloud.databricks.com', httpPath: '/sql/1' },
      definitionId: 'databricks-token',
      fields: { token: secret },
    },
  ])(
    'configures, validates, renames, and deletes $type with $configuration',
    async ({ type, configuration, definitionId, fields }) => {
      const credentialId =
        definitionId === 'google-service-account'
          ? await createServiceAccountCredential(app, {
              projectId: '0',
              title: 'Warehouse account',
              ownerIds: ['1'],
              clientEmail: 'warehouse@cloud-project.iam.gserviceaccount.com',
            })
          : await createCredential(app, {
              projectId: '0',
              definitionId,
              title: 'Warehouse credential',
              secret: { fields },
              publicMetadata: null,
              ownerIds: ['1'],
              contextIds: [],
            });
      const validator = app.get(DataStorageAccessValidatorFacade);
      const verify = jest.spyOn(validator, 'verifyAccess').mockResolvedValue(undefined);
      const validate = jest
        .spyOn(validator, 'validateAccess')
        .mockResolvedValue(ValidationResult.success());
      try {
        const client = await connect('modern');
        const { storage_id } = await call(client, 'create_storage', {
          storage_type: type,
          title: 'Warehouse',
        });
        expect(await call(client, 'validate_storage_access', { storage_id })).toMatchObject({
          valid: false,
          state: 'unconfigured',
        });
        await denied(client, 'update_storage', { storage_id, credential_id: credentialId });
        expect(
          await call(client, 'update_storage', {
            storage_id,
            configuration,
            credential_id: credentialId,
          })
        ).toMatchObject({
          storage_id,
          configuration,
          credential: { credential_id: credentialId },
        });
        expect(verify).toHaveBeenCalledWith(type, configuration, expect.any(Object));
        expect(await call(client, 'validate_storage_access', { storage_id })).toMatchObject({
          valid: true,
          state: 'valid',
        });
        await call(client, 'update_storage', { storage_id, title: 'Renamed warehouse' });
        expect(await call(client, 'get_storage', { storage_id })).toMatchObject({
          title: 'Renamed warehouse',
          configuration,
          credential: { credential_id: credentialId },
        });
        expect(
          (await database.getRepository(DataStorage).findOneByOrFail({ id: storage_id as string }))
            .config
        ).toEqual(configuration);
        expect(verify).toHaveBeenCalledTimes(1);
        await call(client, 'delete_storage', { storage_id });
        expect(
          await database.getRepository(DataStorage).findOneBy({ id: storage_id as string })
        ).toBeNull();
        expect(
          await database.getRepository(Credential).findOneBy({ id: credentialId })
        ).not.toBeNull();
      } finally {
        verify.mockRestore();
        validate.mockRestore();
      }
    }
  );

  it.each(['legacy', 'modern'] as const)(
    'creates, updates, and deletes a Storage over %s MCP',
    async era => {
      const client = await connect(era);
      const input = { storage_type: 'GOOGLE_BIGQUERY' };
      const before = await database.getRepository(DataStorage).count();
      const created = await call(client, 'create_storage', input);
      const storage_id = created.storage_id as string;
      expect(created).toMatchObject({
        storage_id: expect.any(String),
        available_for_use: true,
        available_for_maintenance: false,
      });
      const second = await call(client, 'create_storage', input);
      expect(second.storage_id).not.toBe(storage_id);
      expect(await database.getRepository(DataStorage).count()).toBe(before + 2);
      await call(client, 'delete_storage', { storage_id: second.storage_id });
      expect(
        await call(client, 'update_storage', { storage_id, title: 'Finance warehouse' })
      ).toMatchObject({ storage_id, title: 'Finance warehouse', configuration: null });
      await call(client, 'set_storage_access', {
        storage_id,
        available_for_use: true,
        available_for_maintenance: false,
      });
      expect(await call(client, 'get_storage', { storage_id })).toMatchObject({
        available_for_use: true,
        title: 'Finance warehouse',
      });
      expect(JSON.stringify(await call(client, 'list_storages', { owner_id: '1' }))).toContain(
        storage_id
      );
      await call(client, 'validate_storage_access', { storage_id });
      await call(client, 'delete_storage', { storage_id });
      await denied(client, 'get_storage', { storage_id });
      expect(await database.getRepository(DataStorage).findOneBy({ id: storage_id })).toBeNull();
    }
  );

  it.each(['legacy', 'modern'] as const)(
    'preserves Destination fields during partial updates over %s MCP',
    async era => {
      const client = await connect(era);
      const input = {
        destination_type: 'email',
        title: 'Finance delivery',
        emails: ['finance@example.test'],
      };
      const before = await database.getRepository(DataDestination).count();
      const created = await call(client, 'add_destination', input);
      const destination_id = created.destination_id as string;
      const second = await call(client, 'add_destination', input);
      expect(second.destination_id).not.toBe(destination_id);
      expect(await database.getRepository(DataDestination).count()).toBe(before + 2);
      await call(client, 'delete_destination', { destination_id: second.destination_id });
      const details = await call(client, 'get_destination', { destination_id });
      expect(details).toMatchObject({
        destination_id,
        connected_google_account: null,
        created_at: expect.any(String),
        available_for_use: false,
        emails: ['finance@example.test'],
      });
      const updated = await call(client, 'update_destination', {
        destination_id,
        title: 'Weekly delivery',
      });
      expect(updated).toMatchObject({
        destination_id,
        connected_google_account: null,
        created_at: details.created_at,
        name: 'Weekly delivery',
        emails: ['finance@example.test'],
      });
      for (const response of [details, updated]) {
        for (const field of ['id', 'connectedGoogleAccount', 'createdAt']) {
          expect(response).not.toHaveProperty(field);
        }
      }
      await call(client, 'set_destination_access', { destination_id, available_for_use: true });
      expect(await call(client, 'get_destination', { destination_id })).toMatchObject({
        name: 'Weekly delivery',
        available_for_use: true,
        emails: ['finance@example.test'],
      });
      expect(await call(client, 'get_destination_impact', { destination_id })).toMatchObject({
        reports_count: 0,
        data_mart_count: 0,
      });
      const listed = await call(client, 'list_destinations', {
        owner_id: '1',
        destination_type: 'email',
      });
      expect(listed.destinations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: destination_id,
            connectedGoogleAccount: null,
            createdAt: details.created_at,
          }),
        ])
      );
      await call(client, 'delete_destination', { destination_id });
      await denied(client, 'get_destination', { destination_id });
      expect(
        await database.getRepository(DataDestination).findOneBy({ id: destination_id })
      ).toBeNull();
    }
  );

  it.each(['storage', 'destination'] as const)(
    'replaces %s owners and Contexts and acknowledges self-removal',
    async kind => {
      const client = await connect('modern');
      const created =
        kind === 'storage'
          ? await call(client, 'create_storage', { storage_type: 'GOOGLE_BIGQUERY' })
          : await call(client, 'add_destination', {
              destination_type: 'email',
              emails: ['team@example.test'],
            });
      const id = created[`${kind}_id`] as string;
      const target = { [`${kind}_id`]: id };
      const contexts = await Promise.all(
        ['Finance', 'Operations'].map(name =>
          agent
            .post('/api/contexts')
            .set(browser)
            .send({ name: `${name} ${randomUUID()}` })
            .expect(201)
        )
      );
      const contextIds = contexts.map(context => context.body.id as string);
      await call(client, `set_${kind}_access`, {
        ...target,
        owner_ids: ['1', '2', '2'],
        context_ids: [...contextIds, contextIds[0]],
        available_for_use: true,
        available_for_maintenance: true,
      });
      const details = await call(client, `get_${kind}`, target);
      expect(details).toMatchObject({
        owners: expect.arrayContaining([
          { user_id: '1', name: expect.anything(), email: expect.anything() },
          { user_id: '2', name: expect.anything(), email: expect.anything() },
        ]),
        contexts: expect.arrayContaining(
          contextIds.map(context_id => expect.objectContaining({ context_id }))
        ),
        available_for_use: true,
        available_for_maintenance: true,
      });
      expect(details.owners).toHaveLength(2);
      expect(details.contexts).toHaveLength(2);
      await call(client, `set_${kind}_access`, { ...target, context_ids: [] });
      expect(await call(client, `get_${kind}`, target)).toMatchObject({
        owners: details.owners,
        contexts: [],
        available_for_use: true,
        available_for_maintenance: true,
      });
      await denied(client, `set_${kind}_access`, { ...target, owner_ids: ['unknown-member'] });
      await denied(client, `set_${kind}_access`, { ...target, context_ids: [randomUUID()] });
      expect(await call(client, `get_${kind}`, target)).toMatchObject({
        owners: details.owners,
        contexts: [],
      });

      roles = kind === 'storage' ? ['editor'] : ['viewer'];
      const changed = await call(client, `set_${kind}_access`, {
        ...target,
        owner_ids: ['2'],
        available_for_use: false,
        available_for_maintenance: false,
      });
      expect(changed).toMatchObject(kind === 'storage' ? { updated: true } : { status: 'updated' });
      await denied(client, `get_${kind}`, target);
      userId = '2';
      expect(await call(client, `get_${kind}`, target)).toMatchObject({
        owners: [expect.objectContaining({ user_id: '2' })],
        contexts: [],
        available_for_use: false,
        available_for_maintenance: false,
      });
      await call(client, `set_${kind}_access`, { ...target, owner_ids: [] });
      await denied(client, `get_${kind}`, target);
      userId = '1';
      roles = ['admin'];
      expect(await call(client, `get_${kind}`, target)).toMatchObject({ owners: [] });
      await call(client, `delete_${kind}`, target);
    }
  );

  it.each(['email', 'slack', 'teams'] as const)(
    'updates %s recipients and preserves them after a rejected update',
    async type => {
      const client = await connect('modern');
      const { destination_id } = await call(client, 'add_destination', {
        destination_type: type,
        title: 'Team delivery',
        emails: ['first@example.test', 'second@example.test'],
      });
      expect(
        await call(client, 'update_destination', {
          destination_id,
          emails: ['updated@example.test'],
        })
      ).toMatchObject({
        name: 'Team delivery',
        type,
        emails: ['updated@example.test'],
      });
      const rejectedFolder = await denied(client, 'update_destination', {
        destination_id,
        drive_folder_url: 'https://drive.google.com/drive/folders/not-for-email',
      });
      expect(JSON.stringify(rejectedFolder)).toContain(
        'Only Google Sheets destinations support a Drive folder.'
      );
      expect(await call(client, 'get_destination', { destination_id })).toMatchObject({
        emails: ['updated@example.test'],
        drive_folder_url: null,
      });
      await call(client, 'delete_destination', { destination_id });
    }
  );

  it('switches Google Chat between saved webhook and email delivery', async () => {
    const credentialId = await createChatWebhookCredential(app, {
      projectId: '0',
      title: 'Chat webhook',
      ownerIds: ['1'],
    });
    const client = await connect('modern');
    const { destination_id } = await call(client, 'add_destination', {
      destination_type: 'google_chat',
      credential_id: credentialId,
      title: 'Chat delivery',
    });
    const webhook = await call(client, 'get_destination', { destination_id });
    expect(webhook).toMatchObject({ emails: null, credential: { credential_id: credentialId } });
    expect(JSON.stringify(webhook)).not.toContain(CHAT_WEBHOOK_URL);
    expect(
      await call(client, 'update_destination', { destination_id, emails: ['space@example.test'] })
    ).toMatchObject({
      name: 'Chat delivery',
      emails: ['space@example.test'],
      credential: null,
    });
    expect(await boundDestinationCredentialId(app, destination_id as string)).toBeNull();
    const restored = await call(client, 'update_destination', {
      destination_id,
      credential_id: credentialId,
    });
    expect(restored).toMatchObject({ emails: null, credential: { credential_id: credentialId } });
    expect(JSON.stringify(restored)).not.toContain(CHAT_WEBHOOK_URL);
    expect(await boundDestinationCredentialId(app, destination_id as string)).toBe(credentialId);
    await call(client, 'delete_destination', { destination_id });
    expect(await database.getRepository(Credential).findOneBy({ id: credentialId })).not.toBeNull();
  });

  it('updates Google Sheets folders and Credentials and rolls back a failed folder check', async () => {
    const firstCredentialId = await createServiceAccountCredential(app, {
      projectId: '0',
      title: 'First account',
      ownerIds: ['1'],
      clientEmail: 'first@cloud-project.iam.gserviceaccount.com',
    });
    const secondCredentialId = await createServiceAccountCredential(app, {
      projectId: '0',
      title: 'Second account',
      ownerIds: ['1'],
      clientEmail: 'second@cloud-project.iam.gserviceaccount.com',
    });
    const validateFolder = jest
      .spyOn(app.get(GoogleSheetsFolderValidator), 'validateConfiguredFolder')
      .mockResolvedValue(undefined);
    const firstFolder = 'https://drive.google.com/drive/folders/first-folder';
    const secondFolder = 'https://drive.google.com/drive/folders/second-folder';
    try {
      const client = await connect('modern');
      const { destination_id } = await call(client, 'add_destination', {
        destination_type: 'google_sheets',
        title: 'Finance sheets',
        credential_id: firstCredentialId,
        drive_folder_url: firstFolder,
      });
      expect(await call(client, 'get_destination', { destination_id })).toMatchObject({
        name: 'Finance sheets',
        drive_folder_url: firstFolder,
        credential: { credential_id: firstCredentialId },
      });
      expect(
        await call(client, 'update_destination', { destination_id, drive_folder_url: secondFolder })
      ).toMatchObject({ drive_folder_url: secondFolder });
      expect(
        await call(client, 'update_destination', { destination_id, drive_folder_url: null })
      ).toMatchObject({ drive_folder_url: null });
      await call(client, 'update_destination', { destination_id, drive_folder_url: secondFolder });
      expect(
        await call(client, 'update_destination', {
          destination_id,
          credential_id: secondCredentialId,
        })
      ).toMatchObject({
        drive_folder_url: secondFolder,
        credential: { credential_id: secondCredentialId },
      });
      expect(validateFolder).toHaveBeenLastCalledWith(
        expect.objectContaining({ config: expect.objectContaining({ folderId: 'second-folder' }) }),
        expect.objectContaining({ credentialId: secondCredentialId })
      );
      expect(await boundDestinationCredentialId(app, destination_id as string)).toBe(
        secondCredentialId
      );

      validateFolder.mockRejectedValueOnce(
        new DestinationFolderAccessException(secret, { folderId: secret })
      );
      await denied(client, 'update_destination', {
        destination_id,
        credential_id: firstCredentialId,
        drive_folder_url: firstFolder,
      });
      expect(await boundDestinationCredentialId(app, destination_id as string)).toBe(
        secondCredentialId
      );
      expect(await call(client, 'get_destination', { destination_id })).toMatchObject({
        drive_folder_url: secondFolder,
        credential: { credential_id: secondCredentialId },
      });
      expect(
        await call(client, 'update_destination', {
          destination_id,
          credential_id: firstCredentialId,
          drive_folder_url: firstFolder,
        })
      ).toMatchObject({
        drive_folder_url: firstFolder,
        credential: { credential_id: firstCredentialId },
      });
      expect(validateFolder).toHaveBeenCalledWith(
        expect.objectContaining({ config: expect.objectContaining({ folderId: 'first-folder' }) }),
        expect.any(Object)
      );
      await call(client, 'delete_destination', { destination_id });
      expect(await boundDestinationCredentialId(app, destination_id as string)).toBeNull();
    } finally {
      validateFolder.mockRestore();
    }
  });

  it('clears the folder after a Google OAuth account change unless a folder is supplied', async () => {
    const credentialIds: string[] = [];
    for (const email of ['first@example.test', 'second@example.test']) {
      credentialIds.push(
        await createCredential(app, {
          projectId: '0',
          definitionId: 'google-sheets-oauth',
          title: email,
          ownerIds: ['1'],
          contextIds: [],
          secret: {
            oauth: {
              provider: 'google',
              clientId: 'test-client',
              tokens: {
                access_token: secret,
                refresh_token: secret,
                token_type: 'Bearer',
                scope: 'https://www.googleapis.com/auth/spreadsheets',
                expiry_date: Date.now() + 3_600_000,
              },
            },
          },
          publicMetadata: {
            account: { email, name: null, picture: null },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          },
        })
      );
    }
    const client = await connect('modern');
    const folder = 'https://drive.google.com/drive/folders/account-folder';
    const { destination_id } = await call(client, 'add_destination', {
      destination_type: 'google_sheets',
      credential_id: credentialIds[0],
      drive_folder_url: folder,
    });
    expect(await call(client, 'get_destination', { destination_id })).toMatchObject({
      drive_folder_url: folder,
    });
    expect(
      await call(client, 'update_destination', { destination_id, credential_id: credentialIds[1] })
    ).toMatchObject({
      drive_folder_url: null,
      credential: { credential_id: credentialIds[1] },
    });
    expect(
      await call(client, 'update_destination', {
        destination_id,
        credential_id: credentialIds[0],
        drive_folder_url: folder,
      })
    ).toMatchObject({
      drive_folder_url: folder,
      credential: { credential_id: credentialIds[0] },
    });
    expect(await call(client, 'get_destination', { destination_id })).toMatchObject({
      drive_folder_url: folder,
    });
    await call(client, 'delete_destination', { destination_id });
  });

  it('preserves Legacy BigQuery identity and rejects its creation and deletion', async () => {
    const storageId = randomUUID();
    const repository = database.getRepository(DataStorage);
    await repository.insert({
      id: storageId,
      projectId: '0',
      title: 'Legacy warehouse',
      type: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      config: { projectId: 'legacy-project', location: 'US' },
      createdById: '1',
      availableForUse: true,
      availableForMaintenance: false,
    });
    const credentialId = await createServiceAccountCredential(app, {
      projectId: '0',
      title: 'Legacy account',
      ownerIds: ['1'],
      clientEmail: 'legacy@legacy-project.iam.gserviceaccount.com',
    });
    const verify = jest
      .spyOn(app.get(DataStorageAccessValidatorFacade), 'verifyAccess')
      .mockResolvedValue(undefined);
    try {
      const client = await connect('modern');
      await denied(client, 'create_storage', { storage_type: 'LEGACY_GOOGLE_BIGQUERY' });
      expect(
        await call(client, 'update_storage', {
          storage_id: storageId,
          title: 'Must not replace title',
          configuration: { projectId: 'must-not-replace-project', location: 'EU' },
          credential_id: credentialId,
        })
      ).toMatchObject({
        title: 'Legacy warehouse',
        configuration: { projectId: 'legacy-project', location: 'EU' },
      });
      expect(verify).toHaveBeenCalledWith(
        DataStorageType.LEGACY_GOOGLE_BIGQUERY,
        { projectId: 'legacy-project', location: 'EU' },
        expect.any(Object)
      );
      expect(
        await call(client, 'list_storages', { storage_type: 'LEGACY_GOOGLE_BIGQUERY' })
      ).toMatchObject({
        storages: expect.arrayContaining([expect.objectContaining({ storage_id: storageId })]),
      });
      await denied(client, 'delete_storage', { storage_id: storageId });
      expect(await call(client, 'get_storage', { storage_id: storageId })).toMatchObject({
        title: 'Legacy warehouse',
      });
    } finally {
      verify.mockRestore();
      await repository.delete(storageId);
    }
  });

  it('manages an existing Excel Destination but rejects creation through MCP', async () => {
    const destinationId = randomUUID();
    const repository = database.getRepository(DataDestination);
    await repository.insert({
      id: destinationId,
      projectId: '0',
      title: 'Excel delivery',
      type: DataDestinationType.EXCEL,
      createdById: '1',
      availableForUse: false,
      availableForMaintenance: false,
    });
    const client = await connect('modern');
    const target = { destination_id: destinationId };
    await denied(client, 'add_destination', { destination_type: 'excel' });
    expect(await call(client, 'get_destination', target)).toMatchObject({
      destination_id: destinationId,
      type: 'excel',
    });
    expect(
      await call(client, 'update_destination', { ...target, title: 'Renamed Excel' })
    ).toMatchObject({ name: 'Renamed Excel', type: 'excel' });
    await call(client, 'set_destination_access', { ...target, available_for_use: true });
    expect(await call(client, 'list_destinations', { destination_type: 'excel' })).toMatchObject({
      destinations: expect.arrayContaining([
        expect.objectContaining({ id: destinationId, available_for_use: true }),
      ]),
    });
    await call(client, 'delete_destination', target);
    expect(await repository.findOneBy({ id: destinationId })).toBeNull();
  });

  it.each(['legacy', 'modern'] as const)(
    'rejects secret fields before writes over %s MCP',
    async era => {
      const client = await connect(era);
      const storage = await call(client, 'create_storage', {
        storage_type: 'GOOGLE_BIGQUERY',
      });
      const destination = await call(client, 'add_destination', {
        destination_type: 'email',
        emails: ['safe@example.test'],
        title: 'Original',
      });
      for (const field of ['credentials', 'password', 'access_token']) {
        await denied(client, 'update_storage', {
          storage_id: storage.storage_id,
          title: 'Must not save',
          [field]: secret,
        });
        await denied(client, 'update_destination', {
          destination_id: destination.destination_id,
          title: 'Must not save',
          [field]: secret,
        });
      }
      expect(
        await call(client, 'get_destination', { destination_id: destination.destination_id })
      ).toMatchObject({ name: 'Original' });
      expect(
        (await call(client, 'get_storage', { storage_id: storage.storage_id })).title
      ).not.toBe('Must not save');
    }
  );

  it.each(['storage', 'destination'] as const)(
    'keeps SQL reads bounded when listing 100 %s resources as a non-admin',
    async kind => {
      const client = await connect('modern');
      userId = '2';
      roles = ['editor'];
      const ids = Array.from({ length: 100 }, () => randomUUID());
      const repository =
        kind === 'storage'
          ? database.getRepository(DataStorage)
          : database.getRepository(DataDestination);
      const rows = ids.map(id => ({
        id,
        title: 'Shared resource',
        projectId: '0',
        createdById: '1',
        availableForUse: true,
        availableForMaintenance: false,
      }));
      const insertRows = async (batch: typeof rows) => {
        if (kind === 'storage') {
          await database
            .getRepository(DataStorage)
            .insert(batch.map(row => ({ ...row, type: DataStorageType.GOOGLE_BIGQUERY })));
        } else {
          await database
            .getRepository(DataDestination)
            .insert(batch.map(row => ({ ...row, type: DataDestinationType.LOOKER_STUDIO })));
        }
      };
      const queries = jest.spyOn(database.logger, 'logQuery');
      try {
        await insertRows(rows.slice(0, 1));
        queries.mockClear();
        await call(client, kind === 'storage' ? 'list_storages' : 'list_destinations');
        const singleCount = queries.mock.calls.length;
        await insertRows(rows.slice(1));
        queries.mockClear();
        const result = await call(
          client,
          kind === 'storage' ? 'list_storages' : 'list_destinations'
        );
        const fullCount = queries.mock.calls.length;
        expect(
          (result[kind === 'storage' ? 'storages' : 'destinations'] as unknown[]).length
        ).toBeGreaterThanOrEqual(100);
        expect(fullCount).toBeLessThanOrEqual(singleCount + 8);
        expect(fullCount).toBeLessThan(50);
      } finally {
        queries.mockRestore();
        await repository.delete(ids);
      }
    }
  );

  it('enforces project, scope, and resource permissions', async () => {
    const client = await connect('modern');
    const storage = await call(client, 'create_storage', {
      storage_type: 'GOOGLE_BIGQUERY',
    });
    const destination = await call(client, 'add_destination', {
      destination_type: 'email',
      emails: ['safe@example.test'],
    });
    scopes = ['mcp:read'];
    await denied(client, 'update_storage', { storage_id: storage.storage_id, title: 'Denied' });
    await denied(client, 'update_destination', {
      destination_id: destination.destination_id,
      title: 'Denied',
    });
    scopes = ['mcp:read', 'mcp:write'];
    projectId = 'another-project';
    await denied(client, 'get_storage', { storage_id: storage.storage_id });
    await denied(client, 'get_destination', { destination_id: destination.destination_id });
    projectId = '0';
    userId = '2';
    roles = ['viewer'];
    await denied(client, 'update_storage', { storage_id: storage.storage_id, title: 'Denied' });
    await denied(client, 'set_destination_access', {
      destination_id: destination.destination_id,
      available_for_use: true,
    });
  });

  it('denies Storage mutations for an editor with USE access but no management permissions', async () => {
    const client = await connect('modern');
    const { storage_id } = await call(client, 'create_storage', {
      storage_type: 'GOOGLE_BIGQUERY',
      title: 'Use without management',
    });
    const before = await call(client, 'get_storage', { storage_id });

    userId = '2';
    roles = ['editor'];
    expect(await call(client, 'validate_storage_access', { storage_id })).toMatchObject({
      state: 'unconfigured',
    });
    await denied(client, 'update_storage', { storage_id, title: 'Denied' });
    await denied(client, 'set_storage_access', { storage_id, owner_ids: ['2'] });
    await denied(client, 'set_storage_access', { storage_id, available_for_use: false });
    await denied(client, 'delete_storage', { storage_id });

    userId = '1';
    roles = ['admin'];
    expect(await call(client, 'get_storage', { storage_id })).toEqual(before);
    await call(client, 'delete_storage', { storage_id });
  });

  it('denies Destination impact to a member who can see and use the Destination', async () => {
    const client = await connect('modern');
    const { destination_id } = await call(client, 'add_destination', {
      destination_type: 'email',
      emails: ['impact@example.test'],
    });
    await call(client, 'set_destination_access', { destination_id, available_for_use: true });

    userId = '2';
    roles = ['viewer'];
    expect(await call(client, 'get_destination', { destination_id })).toMatchObject({
      destination_id,
      available_for_use: true,
    });
    await denied(client, 'get_destination_impact', { destination_id });
    await denied(client, 'delete_destination', { destination_id });

    userId = '1';
    roles = ['admin'];
    await call(client, 'delete_destination', { destination_id });
  });

  it('rejects secret-key rotation for a non-Looker Destination without changing its Credential', async () => {
    const client = await connect('modern');
    const { destination_id } = await call(client, 'add_destination', {
      destination_type: 'email',
      emails: ['rotation@example.test'],
    });
    const row = await database
      .getRepository(DataDestination)
      .findOneByOrFail({ id: destination_id as string });
    const credentials = database.getRepository(DataDestinationCredential);
    const before = await credentials.findOneByOrFail({ id: row.credentialId! });

    const rejectedRotation = await denied(client, 'rotate_destination_secret_key', {
      destination_id,
    });
    expect(JSON.stringify(rejectedRotation)).toContain(
      'Only Looker Studio destinations support key rotation.'
    );

    expect(await credentials.findOneByOrFail({ id: row.credentialId! })).toEqual(before);
    expect(await call(client, 'get_destination', { destination_id })).toMatchObject({
      emails: ['rotation@example.test'],
    });
    await call(client, 'delete_destination', { destination_id });
  });

  it('uses a bound private Credential without exposing its secret or granting Credential access', async () => {
    const client = await connect('modern');
    const credentialId = await createCredential(app, {
      projectId: '0',
      definitionId: 'databricks-token',
      title: 'Private warehouse token',
      secret: { fields: { token: secret } },
      publicMetadata: null,
      ownerIds: ['1'],
      contextIds: [],
    });
    const validator = app.get(DataStorageAccessValidatorFacade);
    const verify = jest.spyOn(validator, 'verifyAccess').mockResolvedValue(undefined);
    const validate = jest
      .spyOn(validator, 'validateAccess')
      .mockResolvedValue(ValidationResult.success());
    try {
      const { storage_id } = await call(client, 'create_storage', {
        storage_type: 'DATABRICKS',
      });
      const configuration = { host: 'warehouse.cloud.databricks.com', httpPath: '/sql/1' };
      expect(
        await call(client, 'update_storage', {
          storage_id,
          configuration,
          credential_id: credentialId,
        })
      ).toMatchObject({ storage_id, configuration, credential: { credential_id: credentialId } });
      expect(verify).toHaveBeenCalledTimes(1);
      await call(client, 'set_storage_access', { storage_id, available_for_use: true });

      userId = '2';
      roles = ['editor'];
      scopes = ['mcp:read'];
      await denied(client, 'get_credential', { credential_id: credentialId });
      expect(await call(client, 'validate_storage_access', { storage_id })).toMatchObject({
        valid: true,
        state: 'valid',
      });
      validate.mockRejectedValueOnce(new Error(secret));
      expect(await call(client, 'validate_storage_access', { storage_id })).toMatchObject({
        valid: false,
        state: 'validation_failed',
      });

      userId = '1';
      roles = ['admin'];
      scopes = ['mcp:read', 'mcp:write'];
      verify.mockRejectedValueOnce(new BadRequestException(secret));
      await denied(client, 'update_storage', {
        storage_id,
        configuration: { ...configuration, httpPath: '/sql/2' },
      });
      expect(await call(client, 'get_storage', { storage_id })).toMatchObject({ configuration });
      await call(client, 'delete_storage', { storage_id });
      expect(
        await database.getRepository(Credential).findOneBy({ id: credentialId })
      ).not.toBeNull();
    } finally {
      verify.mockRestore();
      validate.mockRestore();
    }
  });

  it('keeps dependent Data Marts and Reports when deletion is blocked', async () => {
    const client = await connect('modern');
    const storage = await call(client, 'create_storage', {
      storage_type: 'GOOGLE_BIGQUERY',
    });
    const destination = await call(client, 'add_destination', {
      destination_type: 'looker_studio',
      title: 'Dependency destination',
    });
    const mart = await agent
      .post('/api/data-marts')
      .set(browser)
      .send(new DataMartBuilder().withStorageId(storage.storage_id as string).build())
      .expect(201);
    const report = await database.getRepository(Report).save({
      title: 'Dependent report',
      dataMart: { id: mart.body.id },
      dataDestination: { id: destination.destination_id as string },
      destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
      createdById: '1',
    });
    await denied(client, 'delete_storage', { storage_id: storage.storage_id });
    expect(
      await call(client, 'get_destination_impact', { destination_id: destination.destination_id })
    ).toMatchObject({ reports_count: 1, data_mart_count: 1 });
    await denied(client, 'delete_destination', { destination_id: destination.destination_id });
    expect(await database.getRepository(Report).findOneBy({ id: report.id })).not.toBeNull();
  });

  it('rotates a Looker Studio key on each call without returning key material', async () => {
    const client = await connect('modern');
    const destination = await call(client, 'add_destination', {
      destination_type: 'looker_studio',
      title: 'Rotation',
    });
    const row = await database
      .getRepository(DataDestination)
      .findOneByOrFail({ id: destination.destination_id as string });
    const credentials = database.getRepository(DataDestinationCredential);
    const before = (await credentials.findOneByOrFail({ id: row.credentialId! })).credentials;
    const input = { destination_id: destination.destination_id };
    const result = await call(client, 'rotate_destination_secret_key', input);
    const after = (await credentials.findOneByOrFail({ id: row.credentialId! })).credentials;
    expect(after).not.toEqual(before);
    expect(result).toMatchObject({ destination_id: row.id, status: 'rotated' });
    expect(JSON.stringify(result)).not.toContain(JSON.stringify(after));
    for (const [key, value] of Object.entries(after)) {
      if (key !== 'type' && typeof value === 'string') {
        expect(JSON.stringify(result)).not.toContain(value);
      }
    }
    await call(client, 'rotate_destination_secret_key', input);
    expect((await credentials.findOneByOrFail({ id: row.credentialId! })).credentials).not.toEqual(
      after
    );
  });
});
