import { INestApplication } from '@nestjs/common';
import { closeTestApp, createTestApp } from '@owox/test-utils';
import { McpToolRegistry } from '../src/ee/mcp/tools/mcp-tool.registry';
import type { McpAuthContext } from '../src/ee/mcp/auth/mcp-auth-context';

describe('MCP connector tools (e2e)', () => {
  let app: INestApplication | undefined;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    if (app) {
      await closeTestApp(app);
    }
  });

  // A project-member auth context shaped like what McpAuthGuard attaches to
  // `request.mcpContext` after verifying a real bearer token (see
  // connector-publish.tool.spec.ts for the same shape at the unit level).
  //
  // TWO independent gates apply to a connector tool call, and this file's
  // contexts are what separates them:
  //  - `scopes` is what the OAuth client asked for. It is enforced outside the
  //    tool body (McpAuthGuard requires mcp:read; McpSdkServerFactory.assertScopes
  //    requires each tool's requiredScopes), which the registration tests
  //    above/below cover declaratively.
  //  - `roles` is who the user is. McpConnectorAuthoringFacadeImpl enforces it
  //    itself, matching ConnectorDefinitionController's REST gating: reading
  //    versions is viewer-accessible, while connector_test / connector_publish /
  //    connector_delete / connector_set_version require editor or admin. Holding
  //    mcp:write is NOT sufficient -- see the viewer test at the bottom of this
  //    file, which drives the same write-scoped context with a viewer role.
  const MCP_CONTEXT: McpAuthContext = {
    clientId: 'e2e-client',
    userId: 'e2e-user',
    projectId: 'e2e-project',
    roles: ['editor'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read', 'mcp:write'],
    authFlow: 'mcp',
  };

  // Same project, same client, same full mcp:read+mcp:write grant -- only the
  // project role differs. Any refusal below is therefore attributable to the
  // role and nothing else.
  const VIEWER_CONTEXT: McpAuthContext = { ...MCP_CONTEXT, roles: ['viewer'] };

  /**
   * Resolves a tool the same way every test in this file already does --
   * `app!.get(McpToolRegistry)` -> `registry.getTool(name)` -- and then invokes
   * its real `handler()`. `getTool()` returns the actual `@Injectable()` tool
   * instance wired by EeModule (see mcp-tool.providers.ts / ee.module.ts), so
   * this calls the production facade -> ConnectorDefinitionService -> TypeORM
   * repository chain against the real (in-memory) database createTestApp()
   * builds -- not a mock. That is what lets the round-trip test below prove
   * the lifecycle closes against real persistence.
   *
   * What this deliberately does NOT exercise: the MCP JSON-RPC/HTTP transport
   * (McpTransportController / McpStreamableHttpTransportHandler) and the OAuth
   * bearer-token guard (McpAuthGuard / IdpMcpAuthAdapter) that sit in front of
   * tool dispatch in production. Those already have dedicated coverage
   * (mcp-oauth.e2e-spec.ts, mcp-auth.guard.spec.ts, mcp-sdk-server.factory.spec.ts),
   * but nothing in this repo today drives a tool call through that HTTP+OAuth
   * path against a live database in one step -- see the task report for where
   * that would belong.
   */
  async function callTool(
    name: string,
    input: unknown,
    context: McpAuthContext = MCP_CONTEXT
  ): Promise<Record<string, unknown>> {
    const registry = app!.get(McpToolRegistry);
    const tool = registry.getTool(name);
    if (!tool) {
      throw new Error(`Tool not registered: ${name}`);
    }
    const result = await tool.handler(input, context);
    return result.structuredContent as Record<string, unknown>;
  }

  it('registers the three Phase A connector discovery tools', () => {
    const registry = app!.get(McpToolRegistry);

    for (const name of ['connector_list', 'connector_search', 'connector_details']) {
      const tool = registry.getTool(name);
      expect(tool).toBeDefined();
      expect(tool!.requiredScopes).toContain('mcp:read');
    }
  });

  it('registers the Phase B connector authoring tools with mcp:write', () => {
    const registry = app!.get(McpToolRegistry);

    for (const name of ['connector_test', 'connector_publish']) {
      const tool = registry.getTool(name);
      expect(tool).toBeDefined();
      expect(tool!.requiredScopes).toContain('mcp:write');
    }
  });

  it('registers the run/observe connector tools', () => {
    const registry = app!.get(McpToolRegistry);
    const run = registry.getTool('connector_run_data_mart');
    expect(run).toBeDefined();
    expect(run!.requiredScopes).toContain('mcp:write');
    const status = registry.getTool('connector_run_status');
    expect(status).toBeDefined();
    expect(status!.requiredScopes).toContain('mcp:read');
  });

  it('registers connector_delete as destructive and write-scoped', () => {
    const registry = app!.get(McpToolRegistry);
    const tool = registry.getTool('connector_delete');
    expect(tool).toBeDefined();
    expect(tool!.annotations!.destructiveHint).toBe(true);
    expect(tool!.requiredScopes).toEqual(['mcp:write']);
  });

  it('registers connector_versions as read-only', () => {
    const registry = app!.get(McpToolRegistry);
    const tool = registry.getTool('connector_versions');
    expect(tool).toBeDefined();
    expect(tool!.requiredScopes).toEqual(['mcp:read']);
  });

  it('registers connector_set_version with mcp:write', () => {
    const registry = app!.get(McpToolRegistry);
    const tool = registry.getTool('connector_set_version');
    expect(tool).toBeDefined();
    expect(tool!.requiredScopes).toEqual(['mcp:write']);
  });

  // The genuine round-trip: proves the lifecycle Tasks 5-8 added actually closes,
  // end to end, against real persistence -- publish (create), read the manifest
  // back (the coverage gap connector-details.tool.spec.ts leaves open, since its
  // mocked facade response never carries a `manifest` key), publish a new version
  // (update), list versions, roll back to the first version, then delete.
  it('closes the connector lifecycle end to end: publish, read back, update, list versions, roll back, and delete', async () => {
    const manifestV1 = {
      version: '1.0',
      name: 'LifecycleProbe',
      baseUrl: 'https://api.example.test',
      parameters: {},
      nodes: {
        items: {
          uniqueKeys: ['id'],
          fields: { id: { apiName: 'id', type: 'integer' } },
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: [] },
        },
      },
    };

    const created = await callTool('connector_publish', {
      name: 'LifecycleProbe',
      title: 'Lifecycle Probe',
      manifest: manifestV1,
    });
    expect(created.version).toBe(1);
    const connectorId = created.connector_id as string;

    // Closes the known gap: asserts the real manifest a fresh session would read
    // back is EXACTLY the one just published (not merely that some `manifest` key
    // exists, which is all connector-details.tool.spec.ts's mocked facade covers).
    const afterCreate = await callTool('connector_details', { connector: 'LifecycleProbe' });
    expect(afterCreate.manifest).toEqual(manifestV1);

    const manifestV2 = { ...manifestV1, title: 'Lifecycle Probe v2' };
    const updated = await callTool('connector_publish', {
      connector_id: connectorId,
      manifest: manifestV2,
    });
    expect(updated.version).toBe(2);
    expect(updated.connector_id).toBe(connectorId);

    const afterUpdate = await callTool('connector_details', { connector: 'LifecycleProbe' });
    expect(afterUpdate.manifest).toEqual(manifestV2);

    const versions = await callTool('connector_versions', { connector_id: connectorId });
    const versionRows = versions.versions as Array<{ version: number; isActive: boolean }>;
    expect(versionRows.map(v => v.version)).toEqual([1, 2]);
    expect(versionRows.find(v => v.isActive)?.version).toBe(2);

    const rolledBack = await callTool('connector_set_version', {
      connector_id: connectorId,
      version: 1,
    });
    expect(rolledBack.active_version).toBe(1);

    // Rollback must restore the ORIGINAL v1 manifest exactly -- not just "still
    // has a name" -- which also proves connector_details re-reads the active
    // version rather than caching the v2 manifest from the update above.
    const afterRollback = await callTool('connector_details', { connector: 'LifecycleProbe' });
    expect(afterRollback.manifest).toEqual(manifestV1);

    const deleted = await callTool('connector_delete', { connector_id: connectorId });
    expect(deleted.deleted).toBe(true);
    expect(deleted.connector_id).toBe(connectorId);

    // `deleted: true` above is a hardcoded literal in
    // McpConnectorAuthoringFacadeImpl.deleteConnector -- it would read true even if
    // softDelete() silently no-op'd. Prove the delete actually happened against real
    // persistence: connector_list reads ConnectorDefinitionService.listByProject(),
    // which excludes soft-deleted rows, so the connector must no longer appear.
    const afterDelete = await callTool('connector_list', {});
    const namesAfterDelete = (afterDelete.connectors as Array<{ name: string }>).map(c => c.name);
    expect(namesAfterDelete).not.toContain('LifecycleProbe');
  });

  // The role gate, driven through the same real registry -> tool -> facade ->
  // ConnectorDefinitionService chain as the lifecycle test above. VIEWER_CONTEXT
  // holds the full mcp:read+mcp:write grant, so nothing here is refused for lack
  // of scope: every refusal is the project role.
  it('refuses connector mutations for a viewer while leaving connector_versions readable', async () => {
    const manifest = {
      version: '1.0',
      name: 'ViewerProbe',
      baseUrl: 'https://api.example.test',
      parameters: {},
      nodes: {
        items: {
          uniqueKeys: ['id'],
          fields: { id: { apiName: 'id', type: 'integer' } },
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: [] },
        },
      },
    };

    const created = await callTool('connector_publish', {
      name: 'ViewerProbe',
      title: 'Viewer Probe',
      manifest,
    });
    const connectorId = created.connector_id as string;

    await expect(
      callTool('connector_test', { manifest, node: 'items' }, VIEWER_CONTEXT)
    ).rejects.toThrow(/connector_test/);
    await expect(
      callTool('connector_publish', { connector_id: connectorId, manifest }, VIEWER_CONTEXT)
    ).rejects.toThrow(/connector_publish/);
    await expect(
      callTool('connector_set_version', { connector_id: connectorId, version: 1 }, VIEWER_CONTEXT)
    ).rejects.toThrow(/connector_set_version/);
    await expect(
      callTool('connector_delete', { connector_id: connectorId }, VIEWER_CONTEXT)
    ).rejects.toThrow(/connector_delete/);

    // Version METADATA stays open to a viewer, matching @Auth(Role.viewer()) on the REST
    // GET :id. The manifest itself does not: GET :id/versions/:version is
    // @Auth(Role.editor()), and connector_details withholds the manifest for the same
    // reason — it is author-written JSON that can carry a literal credential.
    const versions = await callTool(
      'connector_versions',
      { connector_id: connectorId },
      VIEWER_CONTEXT
    );
    expect((versions.versions as Array<{ version: number }>).map(v => v.version)).toEqual([1]);

    // Nothing above mutated anything: the connector is still there, still on v1,
    // and an editor can still do what the viewer was refused.
    const stillListed = await callTool('connector_list', {});
    expect((stillListed.connectors as Array<{ name: string }>).map(c => c.name)).toContain(
      'ViewerProbe'
    );
    const deleted = await callTool('connector_delete', { connector_id: connectorId });
    expect(deleted.deleted).toBe(true);
  });
});
