import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, type McpServer } from '@modelcontextprotocol/server';
import type { INestApplication } from '@nestjs/common';
import type { Project } from '@owox/idp-protocol';
import { AUTH_HEADER, closeTestApp, createTestApp, StorageBuilder } from '@owox/test-utils';
import type * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import { DataMart } from '../src/data-marts/entities/data-mart.entity';
import { DataStorage } from '../src/data-marts/entities/data-storage.entity';
import { DataStorageCredential } from '../src/data-marts/entities/data-storage-credential.entity';
import { StorageCredentialType } from '../src/data-marts/enums/storage-credential-type.enum';
import { GoogleServiceAccountKeySchema } from '../src/common/schemas/google-service-account-key.schema';
import { DataMartSchemaProviderFacade } from '../src/data-marts/data-storage-types/facades/data-mart-schema-provider.facade';
import { CreateViewExecutorFacade } from '../src/data-marts/data-storage-types/facades/create-view-executor.facade';
import { BigQueryDataMartSchemaSchema } from '../src/data-marts/data-storage-types/bigquery/schemas/bigquery-data-mart.schema';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../src/data-marts/data-storage-types/data-storage-providers';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import type { TypeResolver } from '../src/common/resolver/type-resolver';
import type { DataStorageReportReader } from '../src/data-marts/data-storage-types/interfaces/data-storage-report-reader.interface';
import { DataMartDefinitionValidatorFacade } from '../src/data-marts/data-storage-types/facades/data-mart-definition-validator-facade.service';
import { AdvancedSearchIndexSyncService } from '../src/data-marts/services/advanced-search-index-sync.service';
import { MCP_CONTEXT_SETUP_FACADE } from '../src/data-marts/facades/mcp-context-setup.facade';
import { MCP_DATA_MART_SETUP_FACADE } from '../src/data-marts/facades/mcp-data-mart-setup.facade';
import { MCP_DATA_MART_MODEL_FACADE } from '../src/data-marts/facades/mcp-data-mart-model.facade';
import { ActualizeDataMartSchemaTool } from '../src/ee/mcp/tools/setup/model/model-mutation.tools';
import { PreviewDataMartTool } from '../src/ee/mcp/tools/setup/model/preview-data-mart.tool';
import { MCP_CUSTOM_CONNECTORS_FACADE } from '../src/data-marts/facades/mcp-custom-connectors.facade';
import { ConnectorDefinitionVersion } from '../src/data-marts/entities/connector-definition-version.entity';
import { Plugin } from '../src/plugin-host/entities/plugin.entity';
import { PluginVersion } from '../src/plugin-host/entities/plugin-version.entity';
import { PluginInstallation } from '../src/plugin-host/entities/plugin-installation.entity';
import { MCP_PLUGIN_SETUP_FACADE } from '../src/plugin-host/facades/mcp-plugin-setup.facade';
import { RunPluginUpdateCheckService } from '../src/plugin-host/use-cases/run-plugin-update-check.service';
import { InstallPluginTool } from '../src/ee/mcp/tools/setup/plugins/install-plugin.tool';
import { UninstallPluginTool } from '../src/ee/mcp/tools/setup/plugins/uninstall-plugin.tool';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { McpConfigService } from '../src/ee/mcp/config/mcp.config';
import { McpCallInstrumentation } from '../src/ee/mcp/observability/mcp-call-instrumentation';
import { McpSdkServerFactory } from '../src/ee/mcp/sdk/mcp-sdk-server.factory';
import { SetupAuthorizationService } from '../src/ee/mcp/setup/setup-authorization.service';
import { McpToolRegistry } from '../src/ee/mcp/tools/mcp-tool.registry';
import { CreateContextTool } from '../src/ee/mcp/tools/setup/contexts/create-context.tool';
import { DeleteContextTool } from '../src/ee/mcp/tools/setup/contexts/delete-context.tool';
import { GetContextImpactTool } from '../src/ee/mcp/tools/setup/contexts/get-context-impact.tool';
import { UpdateContextTool } from '../src/ee/mcp/tools/setup/contexts/update-context.tool';
import {
  CreateDataMartTool,
  DeleteDataMartTool,
  PublishDataMartTool,
  UpdateDataMartDefinitionTool,
  UpdateDataMartMetadataTool,
} from '../src/ee/mcp/tools/setup/data-marts/data-mart-setup-mutation.tools';
import {
  GetDataMartChangeImpactTool,
  GetDataMartSetupTool,
} from '../src/ee/mcp/tools/setup/data-marts/data-mart-setup.tools';
import {
  GetCustomConnectorSetupTool,
  SaveCustomConnectorDraftTool,
} from '../src/ee/mcp/tools/setup/custom-connectors/custom-connectors.tools';

// Actual app modules, migrations, authorization and domain persistence. External
// IdP, warehouse validation and embedding scheduling are controlled. Tools use an in-memory
// server here, never to the application's production registry or HTTP endpoint.
describe('Dormant Setup tools through SDK and the complete application', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let client: Client;
  let server: McpServer;
  const project: Project = { id: '0', title: 'Setup test', roles: ['admin'], status: 'active' };
  const reader = {
    honorsQueryTimeout: true,
    type: DataStorageType.GOOGLE_BIGQUERY,
    prepareReportData: jest.fn().mockResolvedValue({
      dataHeaders: [{ name: 'value', storageFieldType: 'INTEGER' }],
    }),
    readReportDataBatch: jest
      .fn()
      .mockResolvedValue({ dataRows: [[1], [2]], nextDataBatchId: null }),
    finalize: jest.fn().mockResolvedValue(undefined),
    getState: () => null,
    initFromState: jest.fn().mockResolvedValue(undefined),
  } satisfies DataStorageReportReader;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    const idp = app.get(IdpProjectionsFacade);
    jest.spyOn(idp, 'getProjectForUser').mockImplementation(async () => project);
    jest.spyOn(app.get(DataMartDefinitionValidatorFacade), 'checkIsValid').mockResolvedValue();
    jest.spyOn(app.get(AdvancedSearchIndexSyncService), 'scheduleReindex').mockResolvedValue();
    jest.spyOn(app.get(RunPluginUpdateCheckService), 'run').mockResolvedValue({} as never);
    jest.spyOn(app.get(DataMartSchemaProviderFacade), 'getActualDataMartSchema').mockResolvedValue(
      BigQueryDataMartSchemaSchema.parse({
        type: 'bigquery-data-mart-schema',
        fields: [{ name: 'value', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' }],
      })
    );
    jest.spyOn(app.get(CreateViewExecutorFacade), 'createView').mockResolvedValue({
      fullyQualifiedName: 'setup-project.dataset.sdk_preview',
    });
    jest
      .spyOn(
        app.get<TypeResolver<DataStorageType, DataStorageReportReader>>(
          DATA_STORAGE_REPORT_READER_RESOLVER
        ),
        'resolve'
      )
      .mockResolvedValue(reader);
    const authorization = new SetupAuthorizationService(idp);
    const contexts = app.get(MCP_CONTEXT_SETUP_FACADE);
    const dataMarts = app.get(MCP_DATA_MART_SETUP_FACADE);
    const model = app.get(MCP_DATA_MART_MODEL_FACADE);
    const connectors = app.get(MCP_CUSTOM_CONNECTORS_FACADE);
    const plugins = app.get(MCP_PLUGIN_SETUP_FACADE);
    const tools = [
      new CreateContextTool(authorization, contexts),
      new UpdateContextTool(authorization, contexts),
      new GetContextImpactTool(authorization, contexts),
      new DeleteContextTool(authorization, contexts),
      new CreateDataMartTool(authorization, dataMarts),
      new UpdateDataMartDefinitionTool(authorization, dataMarts),
      new UpdateDataMartMetadataTool(authorization, dataMarts),
      new GetDataMartSetupTool(authorization, dataMarts),
      new GetDataMartChangeImpactTool(authorization, dataMarts),
      new DeleteDataMartTool(authorization, dataMarts),
      new PublishDataMartTool(authorization, dataMarts),
      new ActualizeDataMartSchemaTool(authorization, model),
      new PreviewDataMartTool(authorization, model),
      new GetCustomConnectorSetupTool(authorization, connectors),
      new SaveCustomConnectorDraftTool(authorization, connectors),
      new InstallPluginTool(authorization, plugins),
      new UninstallPluginTool(authorization, plugins),
    ];
    expect(
      app
        .get(McpToolRegistry)
        .getTools()
        .map(tool => tool.name)
    ).not.toEqual(expect.arrayContaining(tools.map(tool => tool.name)));
    for (const tool of tools) expect(app.get(McpToolRegistry).getTool(tool.name)).toBeUndefined();
    server = new McpSdkServerFactory(
      app.get(McpConfigService),
      new McpToolRegistry(tools),
      app.get(McpCallInstrumentation)
    ).create({
      projectId: '0',
      userId: '0',
      clientId: 'isolated-setup-e2e',
      roles: ['admin'],
      scopes: ['mcp:read', 'mcp:write'],
      resource: 'https://setup.example.test/mcp',
      authFlow: 'mcp',
    });
    client = new Client({ name: 'isolated-setup-e2e', version: '0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    if (client) await client.close();
    if (server) await server.close();
    if (app) await closeTestApp(app);
  });

  async function call(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    expect(result).not.toMatchObject({ isError: true });
    return result.structuredContent as Record<string, unknown>;
  }

  it('recovers Context creation/deletion and rejects a change after an intervening REST update', async () => {
    const create = { name: 'SDK Context', operationId: 'context-create' };
    const created = await call('create_context', create);
    const outcome = created.outcome as { resourceId: string; revision: number };
    expect(await call('create_context', create)).toEqual(created);
    const change = { action: 'update_context', contextId: outcome.resourceId, name: 'SDK update' };
    const { changeImpact } = await call('get_context_impact', { change });
    const impact = changeImpact as { revision: number; impactDigest: string };
    const rest = await agent
      .put(`/api/contexts/${outcome.resourceId}`)
      .set(AUTH_HEADER)
      .send({ name: 'REST update', expectedRevision: impact.revision });
    expect(rest.status).toBe(200);
    const stale = await client.callTool({
      name: 'update_context',
      arguments: {
        contextId: outcome.resourceId,
        name: 'SDK update',
        expectedRevision: impact.revision,
        impactDigest: impact.impactDigest,
      },
    });
    expect(stale.isError).toBe(true);
    const { impact: deletionImpact } = await call('get_context_impact', {
      contextId: outcome.resourceId,
    });
    const deletion = deletionImpact as { revision: number; impactDigest: string };
    const remove = {
      contextId: outcome.resourceId,
      expectedRevision: deletion.revision,
      impactDigest: deletion.impactDigest,
      operationId: 'context-delete',
    };
    const deleted = await call('delete_context', remove);
    expect(deleted).toMatchObject({ outcome: { deleted: true, state: 'completed' } });
    expect(await call('delete_context', remove)).toEqual(deleted);
  });

  it('creates a Data Mart, refreshes schema, previews, publishes, handles REST conflicts and recovers deletion', async () => {
    const storage = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().build());
    expect(storage.status).toBe(201);
    // A configured warehouse is a prerequisite; its external calls are controlled above.
    const database = app.get(DataSource);
    const credentials = database.getRepository(DataStorageCredential);
    const credential = await credentials.save(
      credentials.create({
        projectId: '0',
        createdById: '0',
        type: StorageCredentialType.GOOGLE_SERVICE_ACCOUNT,
        credentials: GoogleServiceAccountKeySchema.parse({
          type: 'service_account',
          project_id: 'setup-project',
          private_key_id: 'fixture',
          private_key: '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----',
          client_email: 'setup@example.test',
          client_id: 'fixture',
          client_x509_cert_url: 'https://example.test/cert',
        }),
      })
    );
    await database.getRepository(DataStorage).update(storage.body.id, {
      config: { projectId: 'setup-project', location: 'US' },
      credentialId: credential.id,
    });
    const input = {
      storageId: storage.body.id,
      title: 'SDK Data Mart',
      operationId: 'mart-create',
    };
    const created = await call('create_data_mart', input);
    expect(await call('create_data_mart', input)).toEqual(created);
    const dataMartId = created.resourceId as string;
    const defined = await call('update_data_mart_definition', {
      dataMartId,
      expectedRevision: created.revision,
      operationId: 'mart-definition',
      definition: { type: 'SQL', sqlQuery: 'SELECT 1 AS value' },
    });
    const rest = await agent
      .put(`/api/data-marts/${dataMartId}/title`)
      .set(AUTH_HEADER)
      .send({ title: 'REST title' });
    expect(rest.status).toBe(200);
    const stale = await client.callTool({
      name: 'update_data_mart_metadata',
      arguments: {
        dataMartId,
        title: 'Stale title',
        expectedRevision: defined.revision,
        operationId: 'mart-title',
      },
    });
    expect(stale.isError).toBe(true);
    expect(
      await app.get(DataSource).getRepository(DataMart).findOneByOrFail({ id: dataMartId })
    ).toMatchObject({
      title: 'REST title',
      definition: { sqlQuery: 'SELECT 1 AS value' },
    });
    const current = await call('get_data_mart_setup', { dataMartId });
    expect(current).toMatchObject({ title: 'REST title', status: 'DRAFT' });
    const schema = await call('actualize_data_mart_schema', {
      dataMartId,
      expectedRevision: current.revision,
    });
    expect(schema).toMatchObject({
      state: 'completed',
      schema: { inputRevision: current.revision, freshness: 'current' },
    });
    const preview = await call('preview_data_mart', { dataMartId, limit: 1 });
    expect(preview).toMatchObject({
      revision: schema.revision,
      observedStatus: 'DRAFT',
      schema: { freshness: 'current', inputRevision: current.revision },
      rows: [[1]],
      rowCount: 1,
      truncated: true,
      reportRunCreated: false,
    });
    expect(reader.prepareReportData).toHaveBeenCalledWith(
      expect.objectContaining({ limitConfig: 2, columnConfig: ['value'] }),
      expect.objectContaining({ sqlOverride: expect.stringContaining('LIMIT 2') })
    );
    const publish = {
      dataMartId,
      expectedRevision: schema.revision,
      operationId: 'mart-publish',
    };
    const published = await call('publish_data_mart', publish);
    expect(published).toMatchObject({ state: 'completed', publicationState: 'PUBLISHED' });
    expect(await call('publish_data_mart', publish)).toMatchObject({
      state: 'completed',
      resourceId: dataMartId,
      revision: published.revision,
      publicationState: 'PUBLISHED',
    });
    const definition = { type: 'SQL', sqlQuery: 'SELECT 2 AS value' };
    const changeImpact = await call('get_data_mart_change_impact', {
      dataMartId,
      action: 'definition',
      definition,
    });
    await call('update_data_mart_definition', {
      dataMartId,
      expectedRevision: changeImpact.revision,
      impactDigest: changeImpact.impactDigest,
      operationId: 'mart-published-definition',
      definition,
    });
    const reviewed = (await call('get_data_mart_change_impact', {
      dataMartId,
      action: 'delete',
    })) as { revision: number; impactDigest: string };
    const remove = {
      dataMartId,
      expectedRevision: reviewed.revision,
      impactDigest: reviewed.impactDigest,
      operationId: 'mart-delete',
    };
    const deleted = await call('delete_data_mart', remove);
    expect(deleted).toMatchObject({ deleted: true, state: 'completed' });
    expect(await call('delete_data_mart', remove)).toEqual(deleted);
    expect(await call('create_data_mart', input)).toEqual(created);
    expect(await call('publish_data_mart', publish)).toEqual({
      state: 'completed',
      resourceId: dataMartId,
      revision: published.revision,
      publicationState: 'PUBLISHED',
    });
    project.roles = ['viewer'];
    const deniedRecovery = await client.callTool({ name: 'delete_data_mart', arguments: remove });
    expect(deniedRecovery.isError).toBe(true);
    project.roles = ['admin'];
  });

  it('prepares an existing manifest in the app, roundtrips protected values through SDK, and honors revocation', async () => {
    const secret = 'synthetic-e2e-private-value';
    const manifest = {
      version: '1.0',
      name: 'SetupE2ESource',
      baseUrl: 'https://api.example.test',
      parameters: {},
      nodes: {
        items: {
          fields: { id: { type: 'string' } },
          uniqueKeys: ['id'],
          request: { method: 'GET', path: '/items', headers: { 'X-Private-Value': secret } },
          recordSelector: { recordPath: [] },
        },
      },
    };
    const created = await agent.post('/api/connectors/custom').set(AUTH_HEADER).send({
      name: manifest.name,
      title: 'Setup E2E source',
      manifest,
    });
    expect(created.status).toBe(201);
    const connectorId = created.body.id as string;
    const before = await call('get_custom_connector_setup', { connectorId });
    expect(before).toMatchObject({
      editing: { state: 'preparation_required', editableDraft: null },
    });
    expect(JSON.stringify(before)).not.toContain(secret);
    const prepared = await agent
      .post(`/api/connectors/custom/${connectorId}/authoring-preparation`)
      .set(AUTH_HEADER)
      .send({
        expectedRevision: created.body.revision,
        version: 1,
        protectedPaths: [['nodes', 'items', 'request', 'headers', 'X-Private-Value']],
        reviewedNonSecretContent: true,
      });
    expect(prepared.status).toBe(201);
    expect(JSON.stringify(prepared.body)).not.toContain(secret);
    const safe = structuredClone(prepared.body.manifest);
    safe.nodes.items.request.path = '/updated';
    const saved = await call('save_custom_connector_draft', {
      connectorId,
      expectedRevision: prepared.body.revision,
      preparationId: prepared.body.preparationId,
      manifest: safe,
    });
    expect(saved).toMatchObject({ outcome: 'completed' });
    expect(JSON.stringify(saved)).not.toContain(secret);
    const version = await app
      .get(DataSource)
      .getRepository(ConnectorDefinitionVersion)
      .findOneByOrFail({
        connectorDefinitionId: connectorId,
        version: 1,
      });
    expect(version.manifest).toMatchObject({
      nodes: { items: { request: { path: '/updated', headers: { 'X-Private-Value': secret } } } },
    });
    const current = await call('get_custom_connector_setup', { connectorId });
    expect(JSON.stringify(current)).not.toContain(secret);
    const editing = current.editing as {
      editableDraft: { preparationId: string; revision: number; manifest: Record<string, unknown> };
    };
    const draft = editing.editableDraft;
    const revoked = await agent
      .delete(`/api/connectors/custom/${connectorId}/authoring-preparations/${draft.preparationId}`)
      .set(AUTH_HEADER);
    expect(revoked.status).toBe(200);
    expect(
      await call('save_custom_connector_draft', {
        connectorId,
        expectedRevision: draft.revision,
        preparationId: draft.preparationId,
        manifest: draft.manifest,
      })
    ).toMatchObject({ outcome: 'app_action_required' });
  });

  it('resumes app-approved Plugin installation and preserves a later restore on old uninstall retry', async () => {
    const database = app.get(DataSource);
    const plugins = database.getRepository(Plugin);
    const versions = database.getRepository(PluginVersion);
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: '987654321',
        repoOwner: 'Example',
        repoName: 'setup-test',
        repoHtmlUrl: 'https://github.com/example/setup-test',
      })
    );
    const version = await versions.save(
      versions.create({
        pluginId: plugin.id,
        semver: '1.0.0',
        commitSha: 'fixture',
        githubReleaseId: '5',
        tagName: 'v1.0.0',
        displayName: 'Setup plugin',
        description: 'Fixture',
        deliveryType: 'remote',
        deliveryUrl: 'https://plugin.example.test',
        releasePublishedAt: null,
      })
    );
    await plugins.update(plugin.id, { currentVersionId: version.id });
    async function completeInstall(expectedRevision: number, operationId: string) {
      const input = {
        pluginId: plugin.id,
        expectedVersionId: version.id,
        expectedRevision,
        operationId,
      };
      const prepared = await call('install_plugin', input);
      const review = prepared.result as { state: string; approvalId: string };
      expect(review.state).toBe('app_required');
      const completed = await agent
        .post(`/api/plugins/${plugin.id}/setup-approvals/${review.approvalId}/complete`)
        .set(AUTH_HEADER)
        .send({ expectedVersionId: version.id, credentialSelections: {} });
      expect(completed.status).toBe(204);
      const result = await call('install_plugin', { ...input, approvalId: review.approvalId });
      expect(result).toMatchObject({ result: { state: 'completed' } });
      return result.result as { installationId: string; revision: number };
    }
    const first = await completeInstall(0, 'plugin-install');
    const remove = {
      pluginId: plugin.id,
      expectedRevision: first.revision,
      operationId: 'plugin-uninstall',
    };
    const deleted = await call('uninstall_plugin', remove);
    const tombstone = deleted.result as { revision: number };
    const restored = await completeInstall(tombstone.revision, 'plugin-restore');
    expect(restored.installationId).toBe(first.installationId);
    expect(await call('uninstall_plugin', remove)).toEqual(deleted);
    expect(
      await database.getRepository(PluginInstallation).findOneByOrFail({ id: first.installationId })
    ).toMatchObject({
      revision: restored.revision,
      uninstalledAt: null,
      userId: '0',
      projectId: '0',
    });
  });
});
