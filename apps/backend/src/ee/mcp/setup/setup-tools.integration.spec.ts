// Import real domain module metadata without initializing warehouse SDKs or app transports.
jest.mock('snowflake-sdk', () => ({}));
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

import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { type Provider, type Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Project } from '@owox/idp-protocol';
import { DataSource } from 'typeorm';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import { serializeSqliteTransactions } from '../../../config/sqlite-transaction-serializer';
import { DataMartsModule } from '../../../data-marts/data-marts.module';
import { MCP_CONTEXT_SETUP_FACADE } from '../../../data-marts/facades/mcp-context-setup.facade';
import { MCP_CUSTOM_CONNECTORS_FACADE } from '../../../data-marts/facades/mcp-custom-connectors.facade';
import { MCP_DATA_MART_EXECUTION_FACADE } from '../../../data-marts/facades/mcp-data-mart-execution.facade';
import { MCP_DATA_MART_MODEL_FACADE } from '../../../data-marts/facades/mcp-data-mart-model.facade';
import { MCP_DATA_MART_SETUP_FACADE } from '../../../data-marts/facades/mcp-data-mart-setup.facade';
import { MCP_SETUP_DISCOVERY_FACADE } from '../../../data-marts/facades/mcp-setup-discovery.facade';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { CreateProjectSettingsTable1783949127000 } from '../../../migrations/1783949127000-create-project-settings-table';
import { AddProjectSettingsRevision1792400000000 } from '../../../migrations/1792400000000-add-project-settings-revision';
import { MCP_PLUGIN_SETUP_FACADE } from '../../../plugin-host/facades/mcp-plugin-setup.facade';
import { PluginHostModule } from '../../../plugin-host/plugin-host.module';
import { ProjectSettings } from '../../../project-settings/entities/project-settings.entity';
import { MCP_PROJECT_SETUP_FACADE } from '../../../project-settings/facades/mcp-project-setup.facade';
import { ProjectSettingsModule } from '../../../project-settings/project-settings.module';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpConfigService } from '../config/mcp.config';
import { McpCallInstrumentation } from '../observability/mcp-call-instrumentation';
import { McpSdkServerFactory } from '../sdk/mcp-sdk-server.factory';
import { MCP_TOOL_DEFINITIONS, type McpToolDefinition } from '../tools/mcp-tool.definition';
import { McpToolRegistry } from '../tools/mcp-tool.registry';
import { GetContextDefaultsTool } from '../tools/setup/contexts/get-context-defaults.tool';
import { GetContextImpactTool } from '../tools/setup/contexts/get-context-impact.tool';
import { GetContextSetupTool } from '../tools/setup/contexts/get-context-setup.tool';
import { ListContextResourcesTool } from '../tools/setup/contexts/list-context-resources.tool';
import { ListSetupProjectMembersTool } from '../tools/setup/contexts/list-setup-project-members.tool';
import {
  GetConnectorAuthoringSchemaTool,
  GetCustomConnectorSetupTool,
  ListCustomConnectorsTool,
  ValidateCustomConnectorTool,
} from '../tools/setup/custom-connectors/custom-connectors.tools';
import {
  GetDataMartChangeImpactTool,
  GetDataMartSetupTool,
  ListSetupDataMartsTool,
  ValidateDataMartTool,
} from '../tools/setup/data-marts/data-mart-setup.tools';
import {
  GetConnectorSetupRequirementsTool,
  ListSetupConnectorsTool,
  ListSetupStoragesTool,
  ListStorageResourcesTool,
} from '../tools/setup/discovery/setup-discovery.tools';
import {
  CancelDataMartRunTool,
  GetDataMartRunTool,
  ListDataMartSchedulesTool,
  RunDataMartTool,
  SaveDataMartScheduleTool,
  DeleteDataMartScheduleTool,
} from '../tools/setup/execution/data-mart-execution.tools';
import { PreviewDataMartTool } from '../tools/setup/model/preview-data-mart.tool';
import {
  ActualizeDataMartSchemaTool,
  UpdateDataMartSchemaTool,
  SetDataMartRelationshipsTool,
  SetDataMartAccessTool,
} from '../tools/setup/model/model-mutation.tools';
import { CheckPluginUpdatesTool } from '../tools/setup/plugins/check-plugin-updates.tool';
import { ConfigurePluginTool } from '../tools/setup/plugins/configure-plugin.tool';
import { GetPluginConfigurationTool } from '../tools/setup/plugins/get-plugin-configuration.tool';
import { GetPluginSetupRequirementsTool } from '../tools/setup/plugins/get-plugin-setup-requirements.tool';
import { GetPluginSetupStatusTool } from '../tools/setup/plugins/get-plugin-setup-status.tool';
import { ListAvailablePluginsTool } from '../tools/setup/plugins/list-available-plugins.tool';
import { InstallPluginTool } from '../tools/setup/plugins/install-plugin.tool';
import { UpdatePluginSetupTool } from '../tools/setup/plugins/update-plugin-setup.tool';
import { UninstallPluginTool } from '../tools/setup/plugins/uninstall-plugin.tool';
import { GetProjectSetupTool } from '../tools/setup/project/get-project-setup.tool';
import { UpdateProjectDescriptionTool } from '../tools/setup/project/update-project-description.tool';
import { CreateContextTool } from '../tools/setup/contexts/create-context.tool';
import { UpdateContextTool } from '../tools/setup/contexts/update-context.tool';
import { SetEntityContextsTool } from '../tools/setup/contexts/set-entity-contexts.tool';
import { SetContextMembersTool } from '../tools/setup/contexts/set-context-members.tool';
import { SetMemberContextScopeTool } from '../tools/setup/contexts/set-member-context-scope.tool';
import { SetContextDefaultsTool } from '../tools/setup/contexts/set-context-defaults.tool';
import { DeleteContextTool } from '../tools/setup/contexts/delete-context.tool';
import {
  CreateDataMartTool,
  UpdateDataMartDefinitionTool,
  UpdateDataMartMetadataTool,
  PublishDataMartTool,
  DeleteDataMartTool,
} from '../tools/setup/data-marts/data-mart-setup-mutation.tools';
import {
  CreateCustomConnectorTool,
  UpdateCustomConnectorMetadataTool,
  SaveCustomConnectorDraftTool,
  TestCustomConnectorTool,
  PublishCustomConnectorTool,
  ActivateCustomConnectorVersionTool,
  DeleteCustomConnectorTool,
} from '../tools/setup/custom-connectors/custom-connectors.tools';
import { SetupAuthorizationService } from './setup-authorization.service';

// This catalog belongs only to this test. Production MCP providers remain unchanged.
const setupTools = [
  ActualizeDataMartSchemaTool,
  UpdateDataMartSchemaTool,
  SetDataMartRelationshipsTool,
  SetDataMartAccessTool,
  RunDataMartTool,
  SaveDataMartScheduleTool,
  DeleteDataMartScheduleTool,
  InstallPluginTool,
  UpdatePluginSetupTool,
  UninstallPluginTool,
  CreateContextTool,
  UpdateContextTool,
  SetEntityContextsTool,
  SetContextMembersTool,
  SetMemberContextScopeTool,
  SetContextDefaultsTool,
  DeleteContextTool,
  CreateDataMartTool,
  UpdateDataMartDefinitionTool,
  UpdateDataMartMetadataTool,
  PublishDataMartTool,
  DeleteDataMartTool,
  CreateCustomConnectorTool,
  UpdateCustomConnectorMetadataTool,
  SaveCustomConnectorDraftTool,
  TestCustomConnectorTool,
  PublishCustomConnectorTool,
  ActivateCustomConnectorVersionTool,
  DeleteCustomConnectorTool,
  GetProjectSetupTool,
  UpdateProjectDescriptionTool,
  GetContextSetupTool,
  ListContextResourcesTool,
  ListSetupProjectMembersTool,
  GetContextDefaultsTool,
  GetContextImpactTool,
  ListSetupStoragesTool,
  ListStorageResourcesTool,
  ListSetupConnectorsTool,
  GetConnectorSetupRequirementsTool,
  ListSetupDataMartsTool,
  GetDataMartSetupTool,
  ValidateDataMartTool,
  GetDataMartChangeImpactTool,
  PreviewDataMartTool,
  GetDataMartRunTool,
  ListDataMartSchedulesTool,
  CancelDataMartRunTool,
  GetConnectorAuthoringSchemaTool,
  ListCustomConnectorsTool,
  GetCustomConnectorSetupTool,
  ValidateCustomConnectorTool,
  ListAvailablePluginsTool,
  GetPluginSetupRequirementsTool,
  GetPluginSetupStatusTool,
  GetPluginConfigurationTool,
  ConfigurePluginTool,
  CheckPluginUpdatesTool,
];

const dataMartFacades = [
  MCP_CONTEXT_SETUP_FACADE,
  MCP_SETUP_DISCOVERY_FACADE,
  MCP_DATA_MART_SETUP_FACADE,
  MCP_DATA_MART_MODEL_FACADE,
  MCP_DATA_MART_EXECUTION_FACADE,
  MCP_CUSTOM_CONNECTORS_FACADE,
];

function providers(module: Type): Provider[] {
  return Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) as Provider[];
}

describe('Isolated Setup SDK assembly', () => {
  it('exports each domain facade from its owning module', () => {
    for (const [module, tokens] of [
      [ProjectSettingsModule, [MCP_PROJECT_SETUP_FACADE]],
      [DataMartsModule, dataMartFacades],
      [PluginHostModule, [MCP_PLUGIN_SETUP_FACADE]],
    ] as const) {
      expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, module)).toEqual(
        expect.arrayContaining([...tokens])
      );
      for (const token of tokens) {
        expect(providers(module)).toContainEqual({
          provide: token,
          useClass: expect.any(Function),
        });
      }
    }
  });

  it('lists all dormant tools and executes versioned project writes through SDK, Nest and SQLite', async () => {
    const database = serializeSqliteTransactions(
      new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [ProjectSettings] })
    );
    await database.initialize();
    const runner = database.createQueryRunner();
    await new CreateProjectSettingsTable1783949127000().up(runner);
    await new AddProjectSettingsRevision1792400000000().up(runner);
    await runner.release();
    const project: Project = {
      id: 'project-1',
      title: 'Project',
      roles: ['admin'],
      status: 'active',
    };
    const context: McpAuthContext = {
      projectId: project.id,
      userId: 'user-1',
      clientId: 'setup-test',
      roles: ['admin'],
      scopes: ['mcp:read', 'mcp:write'],
      resource: 'https://mcp.test/mcp',
      authFlow: 'mcp',
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ...providers(ProjectSettingsModule),
        {
          provide: getRepositoryToken(ProjectSettings),
          useValue: database.getRepository(ProjectSettings),
        },
        { provide: IdpProjectionsFacade, useValue: { getProjectForUser: async () => project } },
        { provide: PublicOriginService, useValue: { getPublicOrigin: () => 'https://app.test' } },
        // Other domains have their own real use-case tests. Here we verify their SDK/DI boundary.
        ...[...dataMartFacades, MCP_PLUGIN_SETUP_FACADE].map(provide => ({
          provide,
          useValue: {},
        })),
        SetupAuthorizationService,
        ...setupTools,
        {
          provide: MCP_TOOL_DEFINITIONS,
          useFactory: (...tools: McpToolDefinition[]) => tools,
          inject: setupTools,
        },
        McpToolRegistry,
        McpSdkServerFactory,
        { provide: McpConfigService, useValue: { serverName: 'setup-test', serverVersion: '0' } },
        {
          provide: McpCallInstrumentation,
          useValue: { wrap: (_name: string, call: unknown) => call },
        },
      ],
    }).compile();
    const server = moduleRef.get(McpSdkServerFactory).create(context);
    const client = new Client({ name: 'setup-test-client', version: '0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const catalog = (await client.listTools()).tools;
      expect(catalog.map(tool => tool.name).sort()).toEqual([
        'activate_custom_connector_version',
        'actualize_data_mart_schema',
        'cancel_data_mart_run',
        'check_plugin_updates',
        'configure_plugin',
        'create_context',
        'create_custom_connector',
        'create_data_mart',
        'delete_context',
        'delete_custom_connector',
        'delete_data_mart',
        'delete_data_mart_schedule',
        'get_connector_authoring_schema',
        'get_connector_setup_requirements',
        'get_context_defaults',
        'get_context_impact',
        'get_context_setup',
        'get_custom_connector_setup',
        'get_data_mart_change_impact',
        'get_data_mart_run',
        'get_data_mart_setup',
        'get_plugin_configuration',
        'get_plugin_setup_requirements',
        'get_plugin_setup_status',
        'get_project_setup',
        'install_plugin',
        'list_available_plugins',
        'list_context_resources',
        'list_custom_connectors',
        'list_data_mart_schedules',
        'list_setup_connectors',
        'list_setup_data_marts',
        'list_setup_project_members',
        'list_setup_storages',
        'list_storage_resources',
        'preview_data_mart',
        'publish_custom_connector',
        'publish_data_mart',
        'run_data_mart',
        'save_custom_connector_draft',
        'save_data_mart_schedule',
        'set_context_defaults',
        'set_context_members',
        'set_data_mart_access',
        'set_data_mart_relationships',
        'set_entity_contexts',
        'set_member_context_scope',
        'test_custom_connector',
        'uninstall_plugin',
        'update_context',
        'update_custom_connector_metadata',
        'update_data_mart_definition',
        'update_data_mart_metadata',
        'update_data_mart_schema',
        'update_plugin_setup',
        'update_project_description',
        'validate_custom_connector',
        'validate_data_mart',
      ]);
      expect(new Set(catalog.map(tool => tool.name)).size).toBe(catalog.length);
      expect(catalog.every(tool => tool.outputSchema && tool.inputSchema)).toBe(true);
      await expect(
        client.callTool({ name: 'get_project_setup', arguments: {} })
      ).resolves.toMatchObject({
        structuredContent: { description: null, revision: 0, can_update_description: true },
      });
      await expect(
        client.callTool({
          name: 'update_project_description',
          arguments: { description: '# Revenue\n\nNet of refunds.', expected_revision: 0 },
        })
      ).resolves.toMatchObject({
        structuredContent: { description: '# Revenue\n\nNet of refunds.', revision: 1 },
      });
      await expect(
        client.callTool({
          name: 'update_project_description',
          arguments: { description: 'Stale overwrite', expected_revision: 0 },
        })
      ).resolves.toMatchObject({ isError: true });
      project.roles = ['editor'];
      await expect(
        client.callTool({
          name: 'update_project_description',
          arguments: { description: null, expected_revision: 1 },
        })
      ).resolves.toMatchObject({ isError: true });
      await expect(
        client.callTool({ name: 'get_project_setup', arguments: {} })
      ).resolves.toMatchObject({
        structuredContent: {
          description: '# Revenue\n\nNet of refunds.',
          revision: 1,
          can_update_description: false,
        },
      });
      expect(await database.getRepository(ProjectSettings).find()).toMatchObject([
        { projectId: 'project-1', description: '# Revenue\n\nNet of refunds.', revision: 1 },
      ]);
    } finally {
      await client.close();
      await server.close();
      await moduleRef.close();
      await database.destroy();
    }
  });
});
