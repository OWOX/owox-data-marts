import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { ConfigService } from '@nestjs/config';
import { OFFLOAD_KEY } from '@owox/internal-helpers';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import type { McpCredentialsFacade } from '../../../../data-marts/credentials/facades/mcp-credentials.facade';
import { adminMcpContext } from '../../../../../test/fixtures/mcp-auth-context';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { McpConfigService } from '../../config/mcp.config';
import { McpCallInstrumentation } from '../../observability/mcp-call-instrumentation';
import type { McpToolCallEvent } from '../../observability/mcp-tool-call-event';
import { McpSdkServerFactory } from '../../sdk/mcp-sdk-server.factory';
import { McpToolRegistry } from '../mcp-tool.registry';
import { ConsentCredentialDefinitionTool } from './consent-credential-definition.tool';
import { DeleteCredentialTool } from './delete-credential.tool';
import { GetCredentialTool } from './get-credential.tool';
import { GetCredentialSetupStatusTool } from './get-credential-setup-status.tool';
import { ListCredentialDefinitionsTool } from './list-credential-definitions.tool';
import { ListCredentialsTool } from './list-credentials.tool';
import { StartCredentialSetupTool } from './start-credential-setup.tool';
import { UpdateCredentialTool } from './update-credential.tool';
import { ValidateCredentialTool } from './validate-credential.tool';

const date = new Date('2026-11-02T10:00:00Z');
const definition = {
  id: 'provider',
  source: 'builtin' as const,
  displayName: 'Provider',
  description: 'API access',
  documentationUrl: null,
  category: 'other' as const,
  connectors: [],
  storageTypes: [],
  destinationTypes: [],
  authType: 'header' as const,
  supportsAi: false,
  compatibilityLine: null,
};
const credential = {
  id: 'credential',
  title: 'API account',
  definition,
  definitionConsentRequired: false,
  enabled: true,
  availableForUse: false,
  availableForMaintenance: false,
  validationState: 'unknown' as const,
  validatedAt: null,
  lastUsedAt: null,
  aiModelMappings: null,
  aiModelMappingModes: null,
  canUse: true,
  ownerIds: ['user-1'],
  contextIds: [],
  usedBy: [],
  hiddenConsumerCount: 2,
  createdAt: date,
  modifiedAt: date,
};
const setup = {
  id: 'setup',
  mode: 'create' as const,
  status: 'pending' as const,
  definitionId: 'provider',
  credentialId: null,
  title: null,
  createdAt: date,
  expiresAt: date,
  completedAt: null,
};
const actor = { projectId: 'project-1', userId: 'user-1', roles: ['admin'] };

describe('Credential tools through the MCP SDK', () => {
  let facade: jest.Mocked<McpCredentialsFacade>;
  let events: McpToolCallEvent[];
  const closers: Array<() => Promise<void>> = [];

  async function open(context: McpAuthContext = adminMcpContext) {
    const publicOrigin = new PublicOriginService(
      new ConfigService({ PUBLIC_ORIGIN: 'https://app.example.test/' })
    );
    const tools = [
      new ListCredentialDefinitionsTool(facade),
      new ListCredentialsTool(facade),
      new GetCredentialTool(facade),
      new UpdateCredentialTool(facade),
      new ValidateCredentialTool(facade),
      new ConsentCredentialDefinitionTool(facade),
      new DeleteCredentialTool(facade),
      new StartCredentialSetupTool(facade, publicOrigin),
      new GetCredentialSetupStatusTool(facade),
    ];
    const factory = new McpSdkServerFactory(
      new McpConfigService(new ConfigService()),
      new McpToolRegistry(tools),
      new McpCallInstrumentation(
        { publishExternalSafely: (event: McpToolCallEvent) => events.push(event) } as never,
        { get: () => undefined, set: () => {} } as never
      )
    );
    const server = factory.create(context);
    const client = new Client({ name: 'credential-contract', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closers.push(async () => {
      await client.close();
      await server.close();
    });
    return client;
  }

  beforeEach(() => {
    events = [];
    facade = {
      listDefinitions: jest.fn().mockResolvedValue([definition]),
      list: jest.fn().mockResolvedValue([credential]),
      get: jest.fn().mockResolvedValue(credential),
      update: jest.fn().mockResolvedValue(credential),
      validate: jest.fn().mockResolvedValue(credential),
      consentDefinition: jest.fn().mockResolvedValue(credential),
      delete: jest.fn().mockResolvedValue(undefined),
      startSetup: jest.fn().mockResolvedValue(setup),
      getSetupStatus: jest.fn().mockResolvedValue(setup),
    };
  });
  afterEach(async () => {
    for (const close of closers.splice(0)) await close();
  });

  it('advertises all nine strict tools and marks validation as an external write', async () => {
    const client = await open();
    const catalog = await client.listTools();
    expect(catalog.tools).toHaveLength(9);
    for (const tool of catalog.tools) expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(
      catalog.tools.find(tool => tool.name === 'validate_credential')?.annotations
    ).toMatchObject({ readOnlyHint: false, openWorldHint: true });
  });

  it.each([
    ['get_credential', 'get'],
    ['validate_credential', 'validate'],
    ['consent_credential_definition', 'consentDefinition'],
  ] as const)('%s retains the actor and returns safe metadata', async (name, method) => {
    const client = await open();
    facade[method].mockResolvedValueOnce({
      ...credential,
      publicMetadata: 'secret-marker',
      validationMessage: 'secret-marker',
    } as never);
    const result = await client.callTool({ name, arguments: { credential_id: 'credential' } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      credential_id: 'credential',
      hidden_consumer_count: 2,
      owner_ids: ['user-1'],
    });
    expect(JSON.stringify(result)).not.toContain('secret-marker');
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('secret-marker');
    expect(events[0].payload[OFFLOAD_KEY]?.arguments).toEqual({ credential_id: 'credential' });
    expect(facade[method]).toHaveBeenCalledWith(actor, 'credential');
  });

  it('maps definitions and both available and unavailable list items', async () => {
    const client = await open();
    facade.list.mockResolvedValueOnce([
      credential,
      {
        id: 'old',
        title: 'Old',
        definitionId: 'missing',
        state: 'unavailable',
        createdAt: date,
        modifiedAt: date,
      },
    ]);
    const definitions = await client.callTool({
      name: 'list_credential_definitions',
      arguments: {},
    });
    expect(definitions.isError).not.toBe(true);
    expect(definitions.structuredContent).toMatchObject({
      definitions: [{ definition_id: 'provider', auth_type: 'header' }],
    });
    const list = await client.callTool({ name: 'list_credentials', arguments: {} });
    expect(list.isError).not.toBe(true);
    expect(list.structuredContent).toMatchObject({
      credentials: [
        { credential_id: 'credential' },
        { credential_id: 'old', state: 'unavailable' },
      ],
    });
    expect(facade.list).toHaveBeenCalledWith(actor);
    const listEvent = events.find(event => event.payload.mcp_tool_name === 'list_credentials');
    expect(listEvent?.payload[OFFLOAD_KEY]?.result).toEqual(list.structuredContent);
  });

  it('reads stored model identifiers without applying new input length limits', async () => {
    const client = await open();
    const model = `provider/${'x'.repeat(300)}`;
    facade.get.mockResolvedValueOnce({ ...credential, aiModelMappings: { fast: model } });
    const result = await client.callTool({
      name: 'get_credential',
      arguments: { credential_id: 'credential' },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ ai_model_mappings: { fast: model } });
  });

  it('passes only metadata, access and AI mapping changes to update', async () => {
    const client = await open();
    const result = await client.callTool({
      name: 'update_credential',
      arguments: {
        credential_id: 'credential',
        title: 'Renamed',
        owner_ids: ['user-2'],
        context_ids: [],
        enabled: false,
        available_for_use: false,
        available_for_maintenance: true,
        ai_model_mappings: { fast: 'model-1' },
        ai_model_mapping_modes: null,
      },
    });
    expect(result.isError).not.toBe(true);
    expect(facade.update).toHaveBeenCalledWith(actor, 'credential', {
      title: 'Renamed',
      ownerIds: ['user-2'],
      contextIds: [],
      enabled: false,
      availableForUse: false,
      availableForMaintenance: true,
      aiModelMappings: { fast: 'model-1' },
      aiModelMappingModes: null,
    });
  });

  it('returns the confirmed deletion without extra domain fields', async () => {
    const client = await open();
    const result = await client.callTool({
      name: 'delete_credential',
      arguments: { credential_id: 'credential' },
    });
    expect(result.structuredContent).toEqual({ credential_id: 'credential', status: 'deleted' });
    expect(facade.delete).toHaveBeenCalledWith(actor, 'credential');
  });

  it('returns an encoded setup URL and exact request ID', async () => {
    const client = await open({ ...adminMcpContext, projectId: 'project /?é' });
    facade.startSetup.mockResolvedValueOnce({ ...setup, id: 'setup/#é' });
    const result = await client.callTool({
      name: 'start_credential_setup',
      arguments: { definition_id: 'provider' },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      setup_id: 'setup/#é',
      status: 'pending',
      credential_id: null,
      url: 'https://app.example.test/ui/project%20%2F%3F%C3%A9/connect/credentials/setup%2F%23%C3%A9',
    });
    expect(facade.startSetup).toHaveBeenCalledWith(
      { ...actor, projectId: 'project /?é' },
      { definitionId: 'provider' }
    );
  });

  it('waits on the same request and reports completion without claiming validation', async () => {
    const client = await open();
    facade.getSetupStatus.mockResolvedValueOnce({
      ...setup,
      status: 'completed',
      credentialId: 'created',
      completedAt: date,
    });
    const result = await client.callTool({
      name: 'get_credential_setup_status',
      arguments: { setup_id: 'setup', wait_seconds: 25 },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      setup_id: 'setup',
      status: 'completed',
      credential_id: 'created',
    });
    expect(facade.getSetupStatus).toHaveBeenCalledWith(actor, 'setup', 25, expect.any(AbortSignal));
  });

  it('passes request cancellation to the bounded setup wait', async () => {
    const signal = new AbortController().signal;
    await new GetCredentialSetupStatusTool(facade).handler(
      { setup_id: 'setup' },
      adminMcpContext,
      signal
    );
    expect(facade.getSetupStatus).toHaveBeenCalledWith(actor, 'setup', 0, signal);
  });

  it.each([
    ['list_credential_definitions', { project_id: 'other' }],
    ['list_credentials', { user_id: 'other' }],
    ['get_credential', { credential_id: 'credential', fields: { arbitrary: 'secret-marker' } }],
    [
      'update_credential',
      { credential_id: 'credential', title: 'Allowed', secret: { value: 'secret-marker' } },
    ],
    ['update_credential', { credential_id: 'credential', fields: { arbitrary: 'secret-marker' } }],
    [
      'update_credential',
      { credential_id: 'credential', customConnector: { fields: { arbitrary: 'secret-marker' } } },
    ],
    ['update_credential', { credential_id: 'credential', title: ' ' }],
    ['update_credential', { credential_id: 'credential' }],
    ['update_credential', { credential_id: 'credential', owner_ids: [] }],
    [
      'update_credential',
      { credential_id: 'credential', ai_model_mapping_modes: { fast: 'invalid' } },
    ],
    [
      'update_credential',
      { credential_id: 'credential', ai_model_mappings: { token: 'secret-marker' } },
    ],
    ['validate_credential', { credential_id: 'credential', token: 'secret-marker' }],
    ['consent_credential_definition', { credential_id: 'credential', project_id: 'other' }],
    ['delete_credential', { credential_id: '' }],
    ['start_credential_setup', { definition_id: 'provider', credential_id: 'credential' }],
    ['start_credential_setup', { definition_id: 'provider', secret: 'secret-marker' }],
    ['start_credential_setup', { title: '   ' }],
    ['start_credential_setup', { title: 'x'.repeat(256) }],
    ['start_credential_setup', { title: 42 }],
    ['start_credential_setup', { credential_id: 'credential', title: 'Replacement name' }],
    ['get_credential_setup_status', { setup_id: 'setup', wait_seconds: 26 }],
    ['get_credential_setup_status', { setup_id: 'setup', wait_seconds: -1 }],
  ])('rejects invalid %s input through the SDK before side effects', async (name, args) => {
    const client = await open();
    const result = await client.callTool({
      name: name as string,
      arguments: args as Record<string, unknown>,
    });
    expect(result.isError).toBe(true);
    for (const method of Object.values(facade)) expect(method).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('secret-marker');
    expect(events).toEqual([]);
  });

  it('uses resource permissions for viewer writes, and still requires the write scope', async () => {
    const client = await open({ ...adminMcpContext, roles: ['viewer'], scopes: ['mcp:read'] });
    const result = await client.callTool({
      name: 'validate_credential',
      arguments: { credential_id: 'credential' },
    });
    expect(result.isError).toBe(true);
    expect(facade.validate).not.toHaveBeenCalled();
    const writer = await open({ ...adminMcpContext, roles: ['viewer'] });
    expect(
      (
        await writer.callTool({
          name: 'validate_credential',
          arguments: { credential_id: 'credential' },
        })
      ).isError
    ).not.toBe(true);
    expect(facade.validate).toHaveBeenCalledWith({ ...actor, roles: ['viewer'] }, 'credential');
  });
});
