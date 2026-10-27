import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, type JsonSchemaType } from '@modelcontextprotocol/server';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import { ContextDto } from '../../../data-marts/dto/domain/context.dto';
import type { McpContextsFacade } from '../../../data-marts/facades/mcp-contexts.facade';
import type { ProjectSettingsFacade } from '../../../project-settings/facades/project-settings.facade';
import { adminMcpContext } from '../../../../test/fixtures/mcp-auth-context';
import { McpConfigService } from '../config/mcp.config';
import { CreateContextTool } from '../tools/context/create-context.tool';
import { UpdateContextMetadataTool } from '../tools/context/update-context-metadata.tool';
import { UpdateProjectDescriptionTool } from '../tools/project/update-project-description.tool';
import { McpToolRegistry } from '../tools/mcp-tool.registry';
import { McpSdkServerFactory } from './mcp-sdk-server.factory';

describe('MCP configuration Unicode input contracts over the SDK', () => {
  it.each([
    { toolName: 'create_context', field: 'name', limit: 255, target: {} },
    {
      toolName: 'update_context_metadata',
      field: 'name',
      limit: 255,
      target: { context_id: 'context' },
    },
    { toolName: 'update_project_description', field: 'description', limit: 10_000, target: {} },
  ])(
    'advertises and accepts valid Unicode while preserving the runtime limit for $toolName',
    async ({ toolName, field, limit, target }) => {
      const toContext = (name: string) =>
        new ContextDto(
          'context',
          name,
          null,
          'project-1',
          null,
          null,
          new Date('2026-10-22T00:00:00.000Z'),
          new Date('2026-10-22T00:00:00.000Z')
        );
      const contexts: Pick<McpContextsFacade, 'createContext' | 'updateContextMetadata'> = {
        createContext: (_ctx, input) => Promise.resolve(toContext(input.name)),
        updateContextMetadata: (_ctx, input) => Promise.resolve(toContext(input.name ?? 'Context')),
      };
      const settings: Pick<ProjectSettingsFacade, 'updateDescription'> = {
        updateDescription: (projectId, input) =>
          Promise.resolve({
            projectId,
            description: input.description,
          }),
      };
      const factory = new McpSdkServerFactory(
        new McpConfigService(new ConfigService()),
        new McpToolRegistry([
          new CreateContextTool(contexts as McpContextsFacade),
          new UpdateContextMetadataTool(contexts as McpContextsFacade),
          new UpdateProjectDescriptionTool(settings as ProjectSettingsFacade),
        ]),
        { wrap: (_name: string, callback: unknown) => callback } as never
      );
      const server = factory.create(adminMcpContext);
      const client = new Client({ name: 'configuration-unicode-test', version: '1' });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const catalog = await client.listTools();
        const advertised = catalog.tools.find(tool => tool.name === toolName);
        if (!advertised) throw new Error(`Missing tool: ${toolName}`);
        const check = new AjvJsonSchemaValidator().getValidator(
          advertised.inputSchema as JsonSchemaType
        );
        const text = '☕️'.repeat(limit);
        const input = { ...target, [field]: text };
        expect(check(input).valid).toBe(true);
        const result = await client.callTool({ name: toolName, arguments: input });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({ [field]: text });

        const rejected = await client.callTool({
          name: toolName,
          arguments: { ...target, [field]: '☕️'.repeat(limit + 1) },
        });
        expect(rejected.isError).toBe(true);
      } finally {
        await client.close();
        await server.close();
      }
    }
  );
});
