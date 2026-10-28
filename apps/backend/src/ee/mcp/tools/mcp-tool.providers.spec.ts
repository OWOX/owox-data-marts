import { MCP_CONTEXTS_FACADE } from '../../../data-marts/facades/mcp-contexts.facade';
import { MCP_CUSTOM_CONNECTORS_FACADE } from '../../../data-marts/facades/mcp-custom-connectors.facade';
import { MCP_PROJECT_MEMBERS_FACADE } from '../../../data-marts/facades/mcp-project-members.facade';
jest.mock(
  '../../../common/producer/producer.module.js',
  () => ({
    ProducerModule: function ProducerModule() {
      return undefined;
    },
  }),
  { virtual: true }
);
jest.mock(
  '../../../idp/guards/idp.guard.js',
  () => ({
    IdpGuard: function IdpGuard() {
      return undefined;
    },
  }),
  { virtual: true }
);

import { Test } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { McpSdkServerFactory } from '../sdk/mcp-sdk-server.factory';
import { McpConfigService } from '../config/mcp.config';
import { McpToolRegistry } from './mcp-tool.registry';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import { CommonModule } from '../../../common/common.module';
import { ClsContextService } from '../../../common/logger/cls-context.service';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { SEARCH_FACADE } from '../../../common/search/search.facade';
import { MCP_DATA_DESTINATIONS_FACADE } from '../../../data-marts/facades/mcp-data-destinations.facade';
import { MCP_DATA_MARTS_FACADE } from '../../../data-marts/facades/mcp-data-marts.facade';
import { MCP_REPORTS_FACADE } from '../../../data-marts/facades/mcp-reports.facade';
import { MCP_SCHEDULED_TRIGGERS_FACADE } from '../../../data-marts/facades/mcp-scheduled-triggers.facade';
import { DataMartsModule } from '../../../data-marts/data-marts.module';
import { MCP_PROJECT_CONTEXT_FACADE } from '../../../idp/facades/mcp-project-context.facade';
import { IdpModule } from '../../../idp/idp.module';
import { ProjectSettingsModule } from '../../../project-settings/project-settings.module';
import { PROJECT_SETTINGS_FACADE } from '../../../project-settings/facades/project-settings.facade';
import { EeModule } from '../../ee.module';
import { MCP_TOOL_DEFINITIONS, type McpToolDefinition } from './mcp-tool.definition';
import { MCP_TOOL_DEFINITIONS_PROVIDER, MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

describe('MCP tool providers', () => {
  function moduleMetadata<T>(key: string, module: object): T[] {
    return (Reflect.getMetadata(key, module) ?? []) as T[];
  }

  it('keeps the real EeModule import/export boundary wired for MCP tools', () => {
    expect(moduleMetadata(MODULE_METADATA.IMPORTS, EeModule)).toEqual(
      expect.arrayContaining([IdpModule, DataMartsModule, CommonModule, ProjectSettingsModule])
    );
    expect(moduleMetadata(MODULE_METADATA.EXPORTS, DataMartsModule)).toEqual(
      expect.arrayContaining([
        MCP_CONTEXTS_FACADE,
        MCP_CUSTOM_CONNECTORS_FACADE,
        MCP_PROJECT_MEMBERS_FACADE,
        MCP_DATA_MARTS_FACADE,
        MCP_DATA_DESTINATIONS_FACADE,
        MCP_REPORTS_FACADE,
        MCP_SCHEDULED_TRIGGERS_FACADE,
      ])
    );
    expect(moduleMetadata(MODULE_METADATA.EXPORTS, IdpModule)).toContain(
      MCP_PROJECT_CONTEXT_FACADE
    );
    expect(moduleMetadata(MODULE_METADATA.EXPORTS, CommonModule)).toContain(PublicOriginService);
    expect(moduleMetadata(MODULE_METADATA.EXPORTS, ProjectSettingsModule)).toContain(
      PROJECT_SETTINGS_FACADE
    );
  });

  it('resolves tools through Nest and exposes Context/project setup through the MCP SDK', async () => {
    const membersFacade = {
      listProjectMembers: jest.fn().mockResolvedValue([
        {
          userId: 'member-1',
          email: 'analyst@example.test',
          displayName: 'Analyst',
          role: 'viewer',
          roleScope: 'selected_contexts',
          contextIds: ['context-1'],
        },
      ]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ...MCP_TOOL_PROVIDER_CLASSES,
        MCP_TOOL_DEFINITIONS_PROVIDER,
        { provide: MCP_CONTEXTS_FACADE, useValue: {} },
        { provide: MCP_CUSTOM_CONNECTORS_FACADE, useValue: {} },
        { provide: MCP_PROJECT_MEMBERS_FACADE, useValue: membersFacade },
        { provide: MCP_DATA_MARTS_FACADE, useValue: {} },
        { provide: MCP_DATA_DESTINATIONS_FACADE, useValue: {} },
        { provide: MCP_REPORTS_FACADE, useValue: {} },
        { provide: MCP_SCHEDULED_TRIGGERS_FACADE, useValue: {} },
        { provide: MCP_PROJECT_CONTEXT_FACADE, useValue: {} },
        { provide: PROJECT_SETTINGS_FACADE, useValue: {} },
        { provide: SEARCH_FACADE, useValue: {} },
        {
          provide: PublicOriginService,
          useValue: { getPublicOrigin: () => 'https://app.example.test' },
        },
        {
          provide: SystemTimeService,
          useValue: { now: () => new Date('2026-07-01T10:00:00.000Z') },
        },
        {
          provide: ClsContextService,
          useValue: { get: () => undefined, set: () => {}, update: () => {} },
        },
      ],
    }).compile();

    try {
      const tools = moduleRef.get<McpToolDefinition[]>(MCP_TOOL_DEFINITIONS);
      const toolNames = tools.map(tool => tool.name);

      expect(toolNames).toEqual(expect.arrayContaining(['run_report', 'get_report_run_status']));
      expect(toolNames).toEqual(
        expect.arrayContaining([
          'create_context',
          'update_context_metadata',
          'get_context_impact',
          'set_context_members',
          'delete_context',
          'list_project_members',
          'get_project_settings',
          'update_project_description',
          'list_custom_connectors',
          'get_custom_connector',
          'create_custom_connector',
          'update_custom_connector',
          'get_custom_connector_version',
          'save_custom_connector_draft',
          'test_custom_connector',
          'publish_custom_connector',
          'activate_custom_connector_version',
          'delete_custom_connector',
          'get_custom_connector_specification',
          'get_custom_connector_fields',
        ])
      );
      expect(new Set(toolNames).size).toBe(toolNames.length);
      expect(
        Object.fromEntries(
          tools.filter(tool => tool.requiredRole).map(tool => [tool.name, tool.requiredRole])
        )
      ).toMatchObject({
        create_context: 'admin',
        update_context_metadata: 'admin',
        get_context_impact: 'admin',
        set_context_members: 'admin',
        delete_context: 'admin',
        list_project_members: 'viewer',
        get_project_settings: 'viewer',
        update_project_description: 'admin',
      });

      const factory = new McpSdkServerFactory(
        new McpConfigService({ get: () => undefined } as never),
        new McpToolRegistry(tools),
        { wrap: (_name: string, handler: unknown) => handler } as never
      );
      const server = factory.create({
        clientId: 'client-1',
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['admin'],
        scopes: ['mcp:read', 'mcp:write'],
        resource: 'https://mcp.example/mcp',
        authFlow: 'mcp',
      });
      const client = new Client({ name: 'context-project-setup-test', version: '1.0.0' });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const catalog = await client.listTools();
        expect(new Set(catalog.tools.map(tool => tool.name))).toEqual(new Set(toolNames));
        const result = await client.callTool({ name: 'list_project_members', arguments: {} });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toEqual({
          members: [
            {
              user_id: 'member-1',
              email: 'analyst@example.test',
              display_name: 'Analyst',
              avatar_url: null,
              role: 'viewer',
              role_scope: 'selected_contexts',
              context_ids: ['context-1'],
            },
          ],
        });
        expect(membersFacade.listProjectMembers).toHaveBeenCalledWith('project-1');
      } finally {
        await client.close();
        await server.close();
      }
    } finally {
      await moduleRef.close();
    }
  });
});
