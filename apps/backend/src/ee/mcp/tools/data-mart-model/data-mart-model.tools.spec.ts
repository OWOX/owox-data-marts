import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { ConfigService } from '@nestjs/config';
import { adminMcpContext } from '../../../../../test/fixtures/mcp-auth-context';
import type { McpDataMartModelFacade } from '../../../../data-marts/facades/mcp-data-mart-model.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { McpConfigService } from '../../config/mcp.config';
import { McpCallInstrumentation } from '../../observability/mcp-call-instrumentation';
import { McpSdkServerFactory } from '../../sdk/mcp-sdk-server.factory';
import { McpToolRegistry } from '../mcp-tool.registry';
import { ListDataMartRelationshipsTool } from './list-data-mart-relationships.tool';
import { CreateDataMartRelationshipTool } from './create-data-mart-relationship.tool';
import { UpdateDataMartRelationshipTool } from './update-data-mart-relationship.tool';
import { DeleteDataMartRelationshipTool } from './delete-data-mart-relationship.tool';
import { PreviewDataMartTool } from './preview-data-mart.tool';

describe('Data Mart model tools through MCP SDK', () => {
  let facade: jest.Mocked<McpDataMartModelFacade>;
  const closers: Array<() => Promise<void>> = [];
  const relationship = {
    id: 'relationship',
    dataStorageId: 'storage',
    targetAlias: 'orders',
    sourceDataMart: { id: 'source', title: 'Source', userHasAccess: true },
    targetDataMart: { id: 'target', title: 'Target', userHasAccess: true },
    joinConditions: [],
    createdAt: '2026-11-05T00:00:00Z',
    modifiedAt: '2026-11-05T00:00:00Z',
  };
  async function open(context: McpAuthContext = adminMcpContext) {
    const factory = new McpSdkServerFactory(
      new McpConfigService(new ConfigService()),
      new McpToolRegistry([
        new ListDataMartRelationshipsTool(facade),
        new CreateDataMartRelationshipTool(facade),
        new UpdateDataMartRelationshipTool(facade),
        new DeleteDataMartRelationshipTool(facade),
        new PreviewDataMartTool(facade),
      ]),
      new McpCallInstrumentation(
        { publishExternalSafely: () => {} } as never,
        { get: () => undefined, set: () => {} } as never
      )
    );
    const server = factory.create(context);
    const client = new Client({ name: 'data-mart-model-contract', version: '1' });
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
    facade = {
      listRelationships: jest.fn().mockResolvedValue({ rootDataMartId: 'source', nodes: [] }),
      createRelationship: jest.fn().mockResolvedValue(relationship),
      updateRelationship: jest.fn().mockResolvedValue(relationship),
      deleteRelationship: jest.fn().mockResolvedValue(undefined),
      preview: jest.fn().mockResolvedValue({
        columns: [{ name: 'id', type: 'INT64' }],
        rows: [[1]],
        rowCount: 1,
        limit: 20,
        truncated: false,
      }),
    };
  });
  afterEach(async () => {
    await Promise.all(closers.splice(0).map(close => close()));
  });

  it('publishes all five tools with strict input contracts', async () => {
    const client = await open();
    const tools = (await client.listTools()).tools;
    expect(tools.map(tool => tool.name)).toEqual([
      'list_data_mart_relationships',
      'create_data_mart_relationship',
      'update_data_mart_relationship',
      'delete_data_mart_relationship',
      'preview_data_mart',
    ]);
    expect(tools.every(tool => tool.inputSchema.additionalProperties === false)).toBe(true);
  });

  it('lists the readable graph and creates a draft relationship with connected actor', async () => {
    const client = await open();
    expect(
      (
        await client.callTool({
          name: 'list_data_mart_relationships',
          arguments: { data_mart_id: 'source' },
        })
      ).structuredContent
    ).toEqual({ rootDataMartId: 'source', nodes: [] });
    const result = await client.callTool({
      name: 'create_data_mart_relationship',
      arguments: {
        data_mart_id: 'source',
        target_data_mart_id: 'target',
        target_alias: 'orders',
        join_conditions: [],
      },
    });
    expect(result.structuredContent).toEqual({ relationship });
    expect(facade.createRelationship).toHaveBeenCalledWith(
      { projectId: 'project-1', userId: 'user-1', roles: ['admin'] },
      {
        dataMartId: 'source',
        targetDataMartId: 'target',
        targetAlias: 'orders',
        joinConditions: [],
        description: undefined,
      }
    );
  });

  it('keeps nullable descriptions and maps strict join fields for update', async () => {
    const client = await open();
    await client.callTool({
      name: 'update_data_mart_relationship',
      arguments: {
        data_mart_id: 'source',
        relationship_id: 'relationship',
        description: null,
        join_conditions: [{ source_field_name: 'id', target_field_name: 'source_id' }],
      },
    });
    expect(facade.updateRelationship).toHaveBeenCalledWith(expect.anything(), {
      dataMartId: 'source',
      relationshipId: 'relationship',
      targetAlias: undefined,
      description: null,
      joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'source_id' }],
    });
    expect(
      (
        await client.callTool({
          name: 'delete_data_mart_relationship',
          arguments: { data_mart_id: 'source', relationship_id: 'relationship' },
        })
      ).structuredContent
    ).toEqual({ data_mart_id: 'source', relationship_id: 'relationship', deleted: true });
  });

  it('allows viewers to preview their readable draft and passes request cancellation', async () => {
    const client = await open({ ...adminMcpContext, roles: ['viewer'] });
    expect(
      (await client.callTool({ name: 'preview_data_mart', arguments: { data_mart_id: 'source' } }))
        .structuredContent
    ).toEqual({
      columns: [{ name: 'id', type: 'INT64' }],
      rows: [[1]],
      rowCount: 1,
      limit: 20,
      truncated: false,
    });
    expect(facade.preview).toHaveBeenCalledWith(
      { projectId: 'project-1', userId: 'user-1', roles: ['viewer'] },
      'source',
      20,
      expect.any(AbortSignal)
    );
  });

  it.each([
    ['list_data_mart_relationships', { data_mart_id: 'source', token: 'secret' }],
    [
      'create_data_mart_relationship',
      {
        data_mart_id: 'source',
        target_data_mart_id: 'target',
        target_alias: 'bad.alias',
        join_conditions: [],
      },
    ],
    [
      'create_data_mart_relationship',
      {
        data_mart_id: 'source',
        target_data_mart_id: 'target',
        target_alias: 'orders',
        join_conditions: [{ source_field_name: 'address.city', target_field_name: 'city' }],
      },
    ],
    [
      'create_data_mart_relationship',
      {
        data_mart_id: 'source',
        target_data_mart_id: 'target',
        target_alias: 'orders',
        join_conditions: [{ source_field_name: 'id', target_field_name: 'id', token: 'secret' }],
      },
    ],
    [
      'update_data_mart_relationship',
      { data_mart_id: 'source', relationship_id: 'relationship', target_data_mart_id: 'other' },
    ],
    ['update_data_mart_relationship', { data_mart_id: 'source', relationship_id: 'relationship' }],
    ['preview_data_mart', { data_mart_id: 'source', limit: 101 }],
    ['preview_data_mart', { data_mart_id: 'source', limit: 0 }],
    ['preview_data_mart', { data_mart_id: 'source', sql: 'SELECT secret' }],
    [
      'delete_data_mart_relationship',
      { data_mart_id: 'source', relationship_id: 'relationship', force: true },
    ],
  ])('rejects invalid or unexpected input for %s', async (name, arguments_) => {
    const client = await open();
    const result = await client.callTool({ name: name as string, arguments: arguments_ });
    expect(result.isError).toBe(true);
    expect(Object.values(facade).every(method => method.mock.calls.length === 0)).toBe(true);
  });

  it('blocks relationship mutation for viewers and warehouse probes without write scope', async () => {
    const viewerClient = await open({ ...adminMcpContext, roles: ['viewer'] });
    expect(
      (
        await viewerClient.callTool({
          name: 'delete_data_mart_relationship',
          arguments: { data_mart_id: 'source', relationship_id: 'relationship' },
        })
      ).isError
    ).toBe(true);
    const readClient = await open({ ...adminMcpContext, scopes: ['mcp:read'] });
    expect(
      (
        await readClient.callTool({
          name: 'preview_data_mart',
          arguments: { data_mart_id: 'source' },
        })
      ).isError
    ).toBe(true);
    expect(facade.deleteRelationship).not.toHaveBeenCalled();
    expect(facade.preview).not.toHaveBeenCalled();
  });
});
