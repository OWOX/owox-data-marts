import type { INestApplication } from '@nestjs/common';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { IdpProvider, McpScope, Payload, Role } from '@owox/idp-protocol';
import { closeTestApp, createTestApp } from '@owox/test-utils';
import type { AddressInfo } from 'node:net';
import { DataSource } from 'typeorm';
import { IdpProviderService } from '../src/idp/services/idp-provider.service';
import { DataDestination } from '../src/data-marts/entities/data-destination.entity';
import { createCredential } from './fixtures/storage-credentials';
import { boundDestinationCredentialId } from './fixtures/destination-credentials';

const browser = { 'x-owox-authorization': 'browser-owner' };
const secret = 'credential-material-must-never-reach-the-agent';

describe('Credential management through MCP and browser handoff', () => {
  let app: INestApplication;
  let agent: Awaited<ReturnType<typeof createTestApp>>['agent'];
  let baseUrl: URL;
  let projectId = '0';
  let userId = '1';
  let scopes: McpScope[] = ['mcp:read', 'mcp:write'];
  let roles: Role[] = ['admin'];
  const clients: Client[] = [];
  const previousOrigin = process.env.OWOX_AUTH_PUBLIC_BASE_URL;
  const previousPublicOrigin = process.env.PUBLIC_ORIGIN;
  const previousMcp = process.env.MCP_PUBLIC_BASE_URL;

  beforeAll(async () => {
    process.env.OWOX_AUTH_PUBLIC_BASE_URL = 'https://app.owox.com';
    process.env.PUBLIC_ORIGIN = 'https://app.owox.com';
    ({ app, agent } = await createTestApp());
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
    ]);
    jest.spyOn(provider, 'verifyMcpAccessToken').mockImplementation(
      async (_token, resource) =>
        ({
          clientId: 'credentials-test',
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
    if (previousOrigin === undefined) delete process.env.OWOX_AUTH_PUBLIC_BASE_URL;
    else process.env.OWOX_AUTH_PUBLIC_BASE_URL = previousOrigin;
    if (previousPublicOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = previousPublicOrigin;
    if (previousMcp === undefined) delete process.env.MCP_PUBLIC_BASE_URL;
    else process.env.MCP_PUBLIC_BASE_URL = previousMcp;
  });

  async function connect(era: 'legacy' | 'modern') {
    const client = new Client(
      { name: 'credentials-test', version: '1' },
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

  async function createInBrowser() {
    const response = await agent
      .post('/api/credentials')
      .set(browser)
      .send({
        title: 'Private Databricks',
        definitionId: 'databricks-token',
        fields: { token: secret },
        availableForUse: false,
        availableForMaintenance: false,
      })
      .expect(201);
    return response.body.id as string;
  }

  it.each(['legacy', 'modern'] as const)(
    'completes setup and manages only metadata over %s MCP',
    async era => {
      const client = await connect(era);
      const definitions = await call(client, 'list_credential_definitions');
      expect(JSON.stringify(definitions)).toContain('databricks-token');
      const setup = await call(client, 'start_credential_setup', {
        definition_id: 'databricks-token',
        title: '  Marketing access  ',
      });
      expect(setup.status).toBe('pending');
      expect(setup.credential_id).toBeNull();
      expect(JSON.stringify(setup)).toContain(`/ui/0/connect/credentials/${setup.setup_id}`);
      const browserSetup = await agent
        .get(`/api/credential-setup/${setup.setup_id}`)
        .set(browser)
        .expect(200);
      expect(browserSetup.body.title).toBe('Marketing access');

      const credentialId = await createInBrowser();
      const waiting = call(client, 'get_credential_setup_status', {
        setup_id: setup.setup_id,
        wait_seconds: 5,
      });
      await agent
        .post(`/api/credential-setup/${setup.setup_id}/complete`)
        .set(browser)
        .send({ credentialId })
        .expect(200);
      expect(await waiting).toMatchObject({ status: 'completed', credential_id: credentialId });
      const credential = await call(client, 'get_credential', { credential_id: credentialId });
      expect(JSON.stringify(credential)).not.toMatch(
        /public_metadata|validation_message|set_secret_field_keys/
      );
      expect(JSON.stringify(await call(client, 'list_credentials'))).toContain(credentialId);
      const updated = await call(client, 'update_credential', {
        credential_id: credentialId,
        title: 'Renamed account',
      });
      expect(JSON.stringify(updated)).toContain('Renamed account');
      await call(client, 'validate_credential', { credential_id: credentialId });
      await call(client, 'consent_credential_definition', { credential_id: credentialId });
      await call(client, 'delete_credential', { credential_id: credentialId });
      await agent.get(`/api/credentials/${credentialId}`).set(browser).expect(404);
      expect(
        await call(client, 'get_credential_setup_status', { setup_id: setup.setup_id })
      ).toMatchObject({ status: 'completed', credential_id: credentialId });
    }
  );

  it.each(['legacy', 'modern'] as const)(
    'uses Credential setup before creating a Google Sheets destination over %s MCP',
    async era => {
      const client = await connect(era);
      const destinations = app.get(DataSource).getRepository(DataDestination);
      const before = await destinations.countBy({ projectId: '0' });
      const setup = await call(client, 'add_destination', {
        destination_type: 'google_sheets',
        title: 'Analyst exports',
      });
      expect(setup.setup_id).toEqual(expect.any(String));
      expect(setup.authorization_url).toBe(
        `https://app.owox.com/ui/0/connect/credentials/${setup.setup_id}`
      );
      expect(setup.destination_id).toBeUndefined();
      expect(await destinations.countBy({ projectId: '0' })).toBe(before);
      const request = await agent
        .get(`/api/credential-setup/${setup.setup_id}`)
        .set(browser)
        .expect(200);
      expect(request.body).toMatchObject({
        definitionId: 'google-sheets-oauth',
        status: 'pending',
      });

      // This fixture represents the Credential saved by the existing OAuth browser flow.
      const credentialId = await createCredential(app, {
        projectId: '0',
        title: 'Google account',
        definitionId: 'google-sheets-oauth',
        ownerIds: ['1'],
        contextIds: [],
        secret: {
          oauth: {
            provider: 'google',
            clientId: 'test-client',
            tokens: {
              access_token: secret,
              refresh_token: 'browser-refresh-token',
              token_type: 'Bearer',
              scope: 'https://www.googleapis.com/auth/spreadsheets',
              expiry_date: Date.now() + 3_600_000,
            },
          },
        },
        publicMetadata: {
          account: { email: 'google-user@example.test', name: null, picture: null },
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        },
      });
      await agent
        .post(`/api/credential-setup/${setup.setup_id}/complete`)
        .set(browser)
        .send({ credentialId })
        .expect(200);
      const completed = await call(client, 'get_credential_setup_status', {
        setup_id: setup.setup_id,
      });
      expect(completed).toMatchObject({ status: 'completed', credential_id: credentialId });
      const destination = await call(client, 'add_destination', {
        destination_type: 'google_sheets',
        credential_id: completed.credential_id,
        title: 'Analyst exports',
      });
      const destinationId = destination.destination_id as string;
      expect(await boundDestinationCredentialId(app, destinationId)).toBe(credentialId);
      expect(await destinations.findOneByOrFail({ id: destinationId })).toMatchObject({
        title: 'Analyst exports',
        projectId: '0',
        availableForUse: false,
      });
      expect(await destinations.countBy({ projectId: '0' })).toBe(before + 1);
    }
  );

  it.each(['legacy', 'modern'] as const)(
    'rejects secret arguments before mutation over %s MCP',
    async era => {
      const client = await connect(era);
      const credentialId = await createInBrowser();
      for (const field of ['secret', 'fields', 'credentials', 'custom_connector', 'access_token']) {
        const result = await client.callTool({
          name: 'update_credential',
          arguments: {
            credential_id: credentialId,
            title: 'Must not save',
            [field]: { value: secret },
          },
        });
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result)).not.toContain(secret);
      }
      const read = await agent.get(`/api/credentials/${credentialId}`).set(browser).expect(200);
      expect(read.body.title).toBe('Private Databricks');
    }
  );

  it('keeps setup state private to its initiating user and project', async () => {
    const client = await connect('modern');
    const setup = await call(client, 'start_credential_setup');
    userId = 'another-admin';
    expect(
      (
        await client.callTool({
          name: 'get_credential_setup_status',
          arguments: { setup_id: setup.setup_id },
        })
      ).isError
    ).toBe(true);
    userId = '1';
    projectId = 'another-project';
    expect(
      (
        await client.callTool({
          name: 'get_credential_setup_status',
          arguments: { setup_id: setup.setup_id },
        })
      ).isError
    ).toBe(true);
  });

  it('enforces write scope and Credential permissions for metadata changes', async () => {
    const client = await connect('modern');
    const credentialId = await createInBrowser();
    scopes = ['mcp:read'];
    expect(
      (
        await client.callTool({
          name: 'update_credential',
          arguments: { credential_id: credentialId, enabled: false },
        })
      ).isError
    ).toBe(true);
    scopes = ['mcp:read', 'mcp:write'];
    roles = ['viewer'];
    userId = 'unrelated-member';
    expect(
      (
        await client.callTool({
          name: 'update_credential',
          arguments: { credential_id: credentialId, enabled: false },
        })
      ).isError
    ).toBe(true);
    expect(JSON.stringify(await call(client, 'list_credentials'))).not.toContain(credentialId);
  });
});
