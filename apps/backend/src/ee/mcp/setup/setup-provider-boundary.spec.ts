// Catalog imports transitively load warehouse adapters; this suite performs no warehouse work.
jest.mock('snowflake-sdk', () => ({}));

import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { McpScope, Project } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import { ClsContextService } from '../../../common/logger/cls-context.service';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { SEARCH_FACADE } from '../../../common/search/search.facade';
import { MCP_CONTEXTS_FACADE } from '../../../data-marts/facades/mcp-contexts.facade';
import { MCP_DATA_DESTINATIONS_FACADE } from '../../../data-marts/facades/mcp-data-destinations.facade';
import { MCP_DATA_MARTS_FACADE } from '../../../data-marts/facades/mcp-data-marts.facade';
import { MCP_REPORTS_FACADE } from '../../../data-marts/facades/mcp-reports.facade';
import { MCP_SCHEDULED_TRIGGERS_FACADE } from '../../../data-marts/facades/mcp-scheduled-triggers.facade';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { MCP_PROJECT_CONTEXT_FACADE } from '../../../idp/facades/mcp-project-context.facade';
import { PROJECT_SETTINGS_FACADE } from '../../../project-settings/facades/project-settings.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpConfigService } from '../config/mcp.config';
import { McpCallInstrumentation } from '../observability/mcp-call-instrumentation';
import { McpSdkServerFactory } from '../sdk/mcp-sdk-server.factory';
import {
  jsonToolResult,
  MCP_TOOL_DEFINITIONS,
  type McpToolDefinition,
} from '../tools/mcp-tool.definition';
import {
  MCP_TOOL_DEFINITIONS_PROVIDER,
  MCP_TOOL_PROVIDER_CLASSES,
} from '../tools/mcp-tool.providers';
import { McpToolRegistry } from '../tools/mcp-tool.registry';
import { SetupAuthorizationService } from './setup-authorization.service';

const context: McpAuthContext = {
  clientId: 'test-client',
  userId: 'user-1',
  projectId: 'project-1',
  roles: ['admin'],
  resource: 'https://mcp.example.test/mcp',
  scopes: ['mcp:read'],
  authFlow: 'mcp',
};

// Test-only provider: future entity tools must authorize in their own handler, too.
@Injectable()
class SetupMetadataProbe implements McpToolDefinition<Record<string, never>> {
  readonly name = 'test_setup_metadata';
  readonly description = 'Test setup metadata';
  readonly zodSchema = {};
  readonly outputSchema = { project_id: z.string(), current_roles: z.array(z.string()) };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  private readonly inputSchema = z.object({}).strict();

  constructor(private readonly authorization: SetupAuthorizationService) {}

  async handler(input: Record<string, never>, auth: McpAuthContext) {
    this.inputSchema.parse(input);
    const actor = await this.authorization.authorize(auth, 'stored-read');
    return jsonToolResult({ project_id: actor.projectId, current_roles: actor.roles });
  }
}

describe('Setup provider boundary', () => {
  async function assemble() {
    const project: Project = {
      id: 'project-1',
      title: 'Project',
      status: 'active',
      roles: ['editor'],
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SetupAuthorizationService,
        SetupMetadataProbe,
        McpToolRegistry,
        McpSdkServerFactory,
        {
          provide: IdpProjectionsFacade,
          useValue: {
            getProjectForUser: async (userId: string, projectId: string) => {
              if (userId !== 'user-1' || projectId !== 'project-1') {
                throw new ForbiddenException();
              }
              return project;
            },
          },
        },
        { provide: McpConfigService, useValue: { serverName: 'setup-test', serverVersion: '0' } },
        {
          provide: McpCallInstrumentation,
          useValue: { wrap: (_name: string, callback: unknown) => callback },
        },
        {
          provide: MCP_TOOL_DEFINITIONS,
          useFactory: (tool: SetupMetadataProbe) => [tool],
          inject: [SetupMetadataProbe],
        },
      ],
    }).compile();
    return { moduleRef, project };
  }

  it('runs an isolated Nest provider through the real SDK and rechecks role changes', async () => {
    const { moduleRef, project } = await assemble();
    const server = moduleRef.get(McpSdkServerFactory).create(context);
    const client = new Client({ name: 'setup-test-client', version: '0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([
        'test_setup_metadata',
      ]);
      await expect(
        client.callTool({ name: 'test_setup_metadata', arguments: {} })
      ).resolves.toMatchObject({
        structuredContent: { project_id: 'project-1', current_roles: ['editor'] },
      });
      project.roles = ['viewer'];
      await expect(
        client.callTool({ name: 'test_setup_metadata', arguments: {} })
      ).resolves.toMatchObject({ isError: true });
    } finally {
      await client.close();
      await server.close();
      await moduleRef.close();
    }
  });

  it('does not let direct handler calls bypass admission, scopes, or project binding', async () => {
    const { moduleRef, project } = await assemble();
    const tool = moduleRef.get(SetupMetadataProbe);
    try {
      await expect(tool.handler({}, { ...context, userId: '' })).rejects.toThrow();
      await expect(tool.handler({}, { ...context, projectId: 'other-project' })).rejects.toThrow();
      await expect(tool.handler({}, { ...context, scopes: ['mcp:write'] })).rejects.toThrow();
      await expect(
        tool.handler({ projectId: 'other-project' } as never, context)
      ).rejects.toThrow();
      project.roles = ['viewer'];
      await expect(tool.handler({}, context)).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      await moduleRef.close();
    }
  });

  it('keeps the production provider catalog unchanged and excludes the setup probe', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ...MCP_TOOL_PROVIDER_CLASSES,
        MCP_TOOL_DEFINITIONS_PROVIDER,
        ...[
          MCP_CONTEXTS_FACADE,
          MCP_DATA_MARTS_FACADE,
          MCP_DATA_DESTINATIONS_FACADE,
          MCP_REPORTS_FACADE,
          MCP_SCHEDULED_TRIGGERS_FACADE,
          MCP_PROJECT_CONTEXT_FACADE,
          PROJECT_SETTINGS_FACADE,
          SEARCH_FACADE,
          ClsContextService,
        ].map(provide => ({ provide, useValue: {} })),
        { provide: PublicOriginService, useValue: { getPublicOrigin: () => 'https://app.test' } },
        { provide: SystemTimeService, useValue: { now: () => new Date(0) } },
      ],
    }).compile();
    try {
      const names = moduleRef.get<McpToolDefinition[]>(MCP_TOOL_DEFINITIONS).map(tool => tool.name);
      expect(names).toEqual([
        'list_contexts',
        'summarize_data_catalog',
        'list_data_marts',
        'get_relevant_data_marts_by_prompt',
        'get_relevant_reports_by_prompt',
        'get_data_mart_details_by_id',
        'get_project_context',
        'list_destinations',
        'get_data_mart_reports',
        'get_report_output_schema',
        'list_report_run_schedules',
        'create_report_run_schedule',
        'update_report_run_schedule',
        'delete_report_run_schedule',
        'query_data_mart',
        'add_report',
        'update_report',
        'delete_report',
        'add_destination',
        'run_report',
        'get_report_run_status',
      ]);
      expect(new Set(names).size).toBe(names.length);
    } finally {
      await moduleRef.close();
    }
  });
});
