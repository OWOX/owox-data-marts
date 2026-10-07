import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod-v4';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpConfigService } from '../config/mcp.config';
import { jsonToolResult, type McpToolDefinition } from '../tools/mcp-tool.definition';
import { McpToolRegistry } from '../tools/mcp-tool.registry';
import { McpSdkServerFactory } from './mcp-sdk-server.factory';

describe('MCP schema refresh over HTTP', () => {
  it.each(['legacy', 'modern'] as const)(
    'refreshes a cached strict schema and accepts future fields without reconnecting (%s)',
    async era => {
      const context = {
        clientId: 'client-1',
        userId: 'user-1',
        projectId: 'project-1',
        scopes: ['mcp:read'],
      } as McpAuthContext;
      let upgraded = false;
      let futureFields = false;
      const oldShape = { data_marts: z.array(z.object({ id: z.string() })) };
      const shape = {
        data_marts: z.array(z.object({ id: z.string(), contexts: z.array(z.string()) })),
      };
      const tool: McpToolDefinition = {
        name: 'list_data_marts',
        description: 'List',
        zodSchema: {},
        outputSchema: shape,
        requiredScopes: ['mcp:read'],
        handler: async () =>
          jsonToolResult({
            data_marts: [
              { id: 'dm-1', contexts: [], ...(futureFields ? { next_field: true } : {}) },
            ],
            ...(futureFields ? { future_root_field: true } : {}),
          }),
      };
      const factory = new McpSdkServerFactory(
        new McpConfigService({ get: () => undefined } as never),
        new McpToolRegistry([tool]),
        { wrap: (_name: string, callback: unknown) => callback } as never
      );
      const handler = createMcpHandler(({ era: requestEra }) => {
        if (upgraded)
          return factory.create(context, undefined, {
            era: requestEra,
            notifyToolsChanged: () => handler.notify.toolsChanged(),
          });
        const server = new McpServer({ name: 'before-upgrade', version: '1' });
        server.registerTool(
          'list_data_marts',
          { inputSchema: {}, outputSchema: oldShape },
          async () => jsonToolResult({ data_marts: [{ id: 'dm-1' }] })
        );
        return server;
      });
      const methods: string[] = [];
      let refreshed!: () => void;
      let refreshFailed!: (error: Error) => void;
      const refreshCompleted = new Promise<void>((resolve, reject) => {
        refreshed = resolve;
        refreshFailed = reject;
      });
      const client = new Client(
        { name: 'schema-cache-test', version: '1' },
        {
          versionNegotiation: { mode: era === 'modern' ? { pin: '2026-07-28' } : 'legacy' },
          listChanged: {
            tools: { onChanged: error => (error ? refreshFailed(error) : refreshed()) },
          },
        }
      );
      const transport = new StreamableHTTPClientTransport(new URL('https://local.test/mcp'), {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          if (request.method === 'POST') methods.push((await request.clone().json()).method);
          return handler.fetch(request);
        },
      });
      try {
        await client.connect(transport);
        const initial = await client.listTools();
        expect(initial.tools[0].outputSchema).toMatchObject({ additionalProperties: false });
        await client.callTool({ name: 'list_data_marts', arguments: {} });

        upgraded = true;
        // This call already captured the old output validator. A refresh can race its result;
        // the next call must work regardless of whether this in-flight one still fails.
        await client.callTool({ name: 'list_data_marts', arguments: {} }).catch(() => undefined);
        await refreshCompleted;
        const afterRefresh = await client.callTool({ name: 'list_data_marts', arguments: {} });
        expect(afterRefresh.structuredContent).toEqual({
          data_marts: [{ id: 'dm-1', contexts: [] }],
        });
        expect(methods.filter(method => method === 'tools/list')).toHaveLength(2);

        futureFields = true;
        const additive = await client.callTool({ name: 'list_data_marts', arguments: {} });
        expect(additive.structuredContent).toEqual({
          data_marts: [{ id: 'dm-1', contexts: [], next_field: true }],
          future_root_field: true,
        });
        expect(methods.filter(method => method === 'tools/list')).toHaveLength(2);
      } finally {
        await client.close();
        await handler.close();
      }
    },
    10_000
  );
});
