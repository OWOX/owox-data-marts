import { ForbiddenException, INestApplication, NotFoundException } from '@nestjs/common';
import { Connectors } from '@owox/connectors';
import { AUTH_HEADER, closeTestApp, createTestApp, StorageBuilder } from '@owox/test-utils';
import { z } from 'zod-v4';
import {
  MCP_CONNECTORS_FACADE,
  type McpConnectorsFacade,
} from '../src/data-marts/facades/mcp-connectors.facade';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../src/data-marts/facades/mcp-data-mart-setup.facade';
import { ConnectorDefinitionSchema } from '../src/data-marts/dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMartDefinitionType } from '../src/data-marts/enums/data-mart-definition-type.enum';
import { DataMartService } from '../src/data-marts/services/data-mart.service';
import { ConnectorSourceCredentialsService } from '../src/data-marts/services/connector/connector-source-credentials.service';
import type { McpAuthContext } from '../src/ee/mcp/auth/mcp-auth-context';
import { ListConnectorsTool } from '../src/ee/mcp/tools/connector/list-connectors.tool';
import { GetConnectorSpecificationTool } from '../src/ee/mcp/tools/connector/get-connector-specification.tool';
import { GetConnectorFieldsTool } from '../src/ee/mcp/tools/connector/get-connector-fields.tool';
import { ListConnectorConfigurationsTool } from '../src/ee/mcp/tools/connector/list-connector-configurations.tool';
import { PreviewConnectorFieldsTool } from '../src/ee/mcp/tools/connector/preview-connector-fields.tool';
import { PreviewConnectorFieldOptionsTool } from '../src/ee/mcp/tools/connector/preview-connector-field-options.tool';
import { UpdateDataMartDefinitionTool } from '../src/ee/mcp/tools/data-mart/update-data-mart-definition.tool';
import { CreateDataMartTool } from '../src/ee/mcp/tools/data-mart/create-data-mart.tool';
import { GetDataMartConfigurationTool } from '../src/ee/mcp/tools/data-mart/get-data-mart-configuration.tool';

const CONNECTOR_NAME = 'McpSetupApi';
const TOKEN = 'SYNTHETIC_MCP_COPY_TOKEN';
const MANIFEST = {
  version: '1.0',
  name: CONNECTOR_NAME,
  baseUrl: 'https://api.example.test',
  authentication: {
    type: 'bearer',
    inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ parameters.Token }}' },
  },
  parameters: {
    Token: {
      requiredType: 'string',
      isRequired: true,
      label: 'API token',
      default: 'SECRET_DEFAULT',
    },
    Region: { requiredType: 'string', label: 'Region', default: 'EU' },
  },
  nodes: {
    items: {
      fields: { id: { type: 'string' }, name: { type: 'string' } },
      uniqueKeys: ['id'],
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: [] },
    },
  },
};

describe('MCP connector setup with real persistence and access decisions', () => {
  let app: INestApplication;
  let agent: Awaited<ReturnType<typeof createTestApp>>['agent'];
  let setup: McpDataMartSetupFacade;
  let connectors: McpConnectorsFacade;
  let dataMarts: DataMartService;
  let credentials: ConnectorSourceCredentialsService;
  let storageId: string;
  const admin: McpAuthContext = {
    clientId: 'test',
    projectId: '0',
    userId: '0',
    roles: ['admin'],
    scopes: ['mcp:read', 'mcp:write'],
    resource: 'https://mcp.example/mcp',
    authFlow: 'mcp',
  };
  const editor: McpAuthContext = { ...admin, userId: '1', roles: ['editor'] };
  const viewer: McpAuthContext = { ...admin, userId: '2', roles: ['viewer'] };

  const createMart = (title: string) => setup.createDataMart(admin, { title, storageId });
  const definitionFor = (name: string, configuration: Record<string, unknown>[]) => ({
    connector: {
      source: { name, configuration, node: 'items', fields: ['id'] },
      storage: { fullyQualifiedName: 'dataset.items' },
    },
  });
  const readDefinition = async (id: string) =>
    ConnectorDefinitionSchema.parse((await dataMarts.getByIdAndProjectId(id, '0')).definition);
  const createSource = async () => {
    const mart = await createMart('Copy source');
    await setup.updateDataMartDefinition(admin, {
      dataMartId: mart.id,
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: definitionFor(CONNECTOR_NAME, [{ Token: TOKEN, Region: 'EU' }]),
    });
    const definition = await readDefinition(mart.id);
    const configuration = definition.connector.source.configuration[0];
    return { mart, definition, configuration, configurationId: configuration._id as string };
  };

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    setup = app.get(MCP_DATA_MART_SETUP_FACADE);
    connectors = app.get(MCP_CONNECTORS_FACADE);
    dataMarts = app.get(DataMartService);
    credentials = app.get(ConnectorSourceCredentialsService);
    const storage = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().build())
      .expect(201);
    storageId = storage.body.id;
    const created = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({ name: CONNECTOR_NAME, title: 'MCP Setup API', manifest: MANIFEST })
      .expect(201);
    await agent
      .post(`/api/connectors/custom/${created.body.id}/publish`)
      .set(AUTH_HEADER)
      .expect(201);
    await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({ name: 'McpDraftApi', title: 'Draft', manifest: { ...MANIFEST, name: 'McpDraftApi' } })
      .expect(201);
  }, 120000);

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await new Promise<void>(resolve => setImmediate(resolve));
    if (app) await closeTestApp(app);
  });

  it('discovers bundled and published custom connectors with usable specification and field contracts', async () => {
    const tool = app.get(ListConnectorsTool);
    const result = await tool.handler({}, viewer);
    const catalog = z.object(tool.outputSchema).parse(result.structuredContent).connectors;
    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'GoogleSheets', is_custom: false }),
        expect.objectContaining({ name: CONNECTOR_NAME, is_custom: true, active_version: 1 }),
      ])
    );
    expect(catalog.map(connector => connector.name)).not.toContain('McpDraftApi');
    const custom = catalog.find(connector => connector.name === CONNECTOR_NAME)!;
    const specTool = app.get(GetConnectorSpecificationTool);
    const specification = await specTool.handler(
      { connector_name: CONNECTOR_NAME, version: 1 },
      viewer
    );
    const parameters = z
      .object(specTool.outputSchema)
      .parse(specification.structuredContent).specification;
    expect(parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Token', attributes: expect.arrayContaining(['SECRET']) }),
        expect.objectContaining({ name: 'Region', default: 'EU' }),
      ])
    );
    expect(JSON.stringify(specification)).not.toContain('SECRET_DEFAULT');
    expect(JSON.stringify(specification)).not.toContain('authentication');
    const apiSpec = await agent
      .get(`/api/connectors/custom/${custom.id}/specification`)
      .set(AUTH_HEADER)
      .expect(200);
    expect(parameters.map(parameter => parameter.name)).toEqual(
      apiSpec.body.map((p: { name: string }) => p.name)
    );
    const fieldsTool = app.get(GetConnectorFieldsTool);
    const fields = await fieldsTool.handler({ connector_name: CONNECTOR_NAME, version: 1 }, viewer);
    expect(z.object(fieldsTool.outputSchema).parse(fields.structuredContent)).toMatchObject({
      nodes: [{ name: 'items', uniqueKeys: ['id'], fields: [{ name: 'id' }, { name: 'name' }] }],
    });
  });

  it('copies by public IDs without internal metadata and saves independent target credentials', async () => {
    const source = await createSource();
    const target = await createMart('Copy target');
    const listTool = app.get(ListConnectorConfigurationsTool);
    const list = await listTool.handler({ connector_name: CONNECTOR_NAME }, admin);
    const rows = z.object(listTool.outputSchema).parse(list.structuredContent).configurations;
    expect(rows).toContainEqual(
      expect.objectContaining({
        data_mart_id: source.mart.id,
        configuration_id: source.configurationId,
        configuration: { Region: 'EU', Token: '**********' },
      })
    );
    expect(JSON.stringify(list)).not.toContain(TOKEN);
    expect(JSON.stringify(list)).not.toContain('_secrets_id');
    const tool = app.get(UpdateDataMartDefinitionTool);
    const result = await tool.handler(
      {
        data_mart_id: target.id,
        definition: {
          type: DataMartDefinitionType.CONNECTOR,
          ...definitionFor(CONNECTOR_NAME, [{ Region: 'US' }]),
        },
        source_data_mart_id: source.mart.id,
        source_configuration_id: source.configurationId,
      },
      admin
    );
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    const saved = (await readDefinition(target.id)).connector.source.configuration[0];
    expect(saved).toMatchObject({ Region: 'US' });
    expect(saved).not.toHaveProperty('Token');
    expect(saved).not.toHaveProperty('_copiedFrom');
    expect(saved._id).not.toBe(source.configurationId);
    expect(saved._secrets_id).not.toBe(source.configuration._secrets_id);
    const copiedCredentials = await credentials.getCredentialsById(saved._secrets_id as string);
    expect(copiedCredentials).toMatchObject({
      dataMartId: target.id,
      configId: saved._id,
      credentials: { Token: TOKEN },
    });
    expect((await readDefinition(source.mart.id)).connector.source.configuration[0]).toEqual(
      source.configuration
    );
    const originalCredentials = await credentials.getCredentialsById(
      source.configuration._secrets_id as string
    );
    expect(originalCredentials).toMatchObject({
      dataMartId: source.mart.id,
      credentials: { Token: TOKEN },
    });
  });

  it('keeps REST public-ID copying and existing UI _copiedFrom copying working', async () => {
    const source = await createSource();
    for (const publicIds of [true, false]) {
      const target = await createMart('REST copy target');
      const definition = definitionFor(
        CONNECTOR_NAME,
        publicIds
          ? [{}]
          : [
              {
                ...source.configuration,
                Token: '**********',
                _copiedFrom: { dataMartId: source.mart.id, configId: source.configurationId },
              },
            ]
      );
      const response = await agent
        .put(`/api/data-marts/${target.id}/definition`)
        .set(AUTH_HEADER)
        .send({
          definitionType: 'CONNECTOR',
          definition,
          sourceDataMartId: source.mart.id,
          ...(publicIds ? { sourceConfigurationId: source.configurationId } : {}),
        })
        .expect(200);
      expect(JSON.stringify(response.body)).not.toContain(TOKEN);
      const saved = (await readDefinition(target.id)).connector.source.configuration[0];
      expect(saved).toMatchObject({ Region: 'EU' });
      const record = await credentials.getCredentialsById(saved._secrets_id as string);
      expect(record).toMatchObject({ dataMartId: target.id, credentials: { Token: TOKEN } });
    }
  });

  it('filters inaccessible sources and rejects source EDIT denial, foreign projects and missing configurations without saving', async () => {
    const source = await createSource();
    await setup.updateDataMartAvailability(admin, {
      dataMartId: source.mart.id,
      availableForReporting: true,
      availableForMaintenance: false,
    });
    expect(
      await connectors.listConnectorConfigurations(editor, { connectorName: CONNECTOR_NAME })
    ).not.toContainEqual(expect.objectContaining({ dataMartId: source.mart.id }));
    await expect(
      connectors.listConnectorConfigurations(viewer, { connectorName: CONNECTOR_NAME })
    ).rejects.toThrow(ForbiddenException);
    const target = await createMart('Unchanged target');
    const copyInput = {
      dataMartId: target.id,
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: definitionFor(CONNECTOR_NAME, [{}]),
      sourceDataMartId: source.mart.id,
      sourceConfigurationId: source.configurationId,
    };
    await setup.updateDataMartAvailability(admin, {
      dataMartId: target.id,
      availableForReporting: true,
      availableForMaintenance: true,
    });
    await expect(setup.updateDataMartDefinition(editor, copyInput)).rejects.toThrow(
      ForbiddenException
    );
    await expect(
      connectors.previewConnectorFields(
        { ...admin, projectId: 'foreign-project' },
        {
          connectorName: CONNECTOR_NAME,
          sourceDataMartId: source.mart.id,
          sourceConfigurationId: source.configurationId,
        }
      )
    ).rejects.toThrow(NotFoundException);
    await expect(
      setup.updateDataMartDefinition(admin, { ...copyInput, sourceConfigurationId: 'missing' })
    ).rejects.toThrow('Source connector configuration not found');
    expect((await dataMarts.getByIdAndProjectId(target.id, '0')).definition).toBeNull();
  });

  it.each(['service-account', 'oauth'] as const)(
    'previews dynamic fields and options with stored %s credentials without modifying the source',
    async authentication => {
      const createTool = app.get(CreateDataMartTool);
      const created = await createTool.handler(
        {
          title: 'Sheets preview source',
          storage_id: storageId,
          connector_name: 'GoogleSheets',
        },
        admin
      );
      const creation = z.object(createTool.outputSchema).parse(created.structuredContent);
      const mart = creation.data_mart;
      const setupUrl = new URL(creation.setup_url);
      expect(setupUrl.pathname).toBe(`/ui/0/data-marts/${mart.id}/data-setup`);
      expect(setupUrl.searchParams.get('connectorName')).toBe('GoogleSheets');
      expect(setupUrl.searchParams.get('preset')).toBe('connector');
      expect(creation.next_steps.length).toBeGreaterThan(0);
      const getTool = app.get(GetDataMartConfigurationTool);
      const initial = await getTool.handler({ data_mart_id: mart.id }, admin);
      expect(initial.structuredContent).toMatchObject({ data_mart: { definition: null } });
      const key =
        authentication === 'oauth'
          ? 'SYNTHETIC_OAUTH_REFRESH_TOKEN'
          : 'SYNTHETIC_SERVICE_ACCOUNT_KEY';
      const oauth =
        authentication === 'oauth'
          ? await credentials.createCredentials(
              '0',
              '0',
              'GoogleSheets',
              {
                refresh_token: key,
                access_token: 'synthetic-access-token',
                client_id: 'synthetic-client-id',
                client_secret: 'synthetic-client-secret',
              },
              null
            )
          : undefined;
      await agent
        .put(`/api/data-marts/${mart.id}/definition`)
        .set(AUTH_HEADER)
        .send({
          definitionType: DataMartDefinitionType.CONNECTOR,
          definition: definitionFor('GoogleSheets', [
            {
              AuthType: oauth
                ? { oauth2: { _source_credential_id: oauth.id } }
                : { service_account: { ServiceAccountKey: key } },
              SpreadsheetId: 'sheet-id',
              SheetName: 'Sheet1',
              HeaderRow: 1,
            },
          ]),
        })
        .expect(200);
      const reread = await getTool.handler({ data_mart_id: mart.id }, admin);
      expect(z.object(getTool.outputSchema).parse(reread.structuredContent)).toMatchObject({
        data_mart: { definitionType: 'CONNECTOR' },
        next_steps: expect.arrayContaining([expect.any(String)]),
      });
      const before = await readDefinition(mart.id);
      const sourceId = before.connector.source.configuration[0]._id as string;
      if (oauth) {
        const target = await createMart('OAuth copy target');
        const copied = await app.get(UpdateDataMartDefinitionTool).handler(
          {
            data_mart_id: target.id,
            definition: {
              type: DataMartDefinitionType.CONNECTOR,
              ...definitionFor('GoogleSheets', [{}]),
            },
            source_data_mart_id: mart.id,
            source_configuration_id: sourceId,
          },
          admin
        );
        expect(JSON.stringify(copied)).not.toContain(key);
        const saved = (await readDefinition(target.id)).connector.source.configuration[0];
        expect(saved).toMatchObject({ AuthType: { oauth2: { _source_credential_id: oauth.id } } });
        expect(saved).not.toHaveProperty('_secrets_id');
        expect(await credentials.getCredentialsById(oauth.id)).toMatchObject({
          dataMartId: null,
          configId: null,
        });
        const listed = await connectors.listConnectorConfigurations(admin, {
          connectorName: 'GoogleSheets',
        });
        expect(JSON.stringify(listed)).not.toContain(oauth.id);
        expect(JSON.stringify(listed)).not.toContain(key);
      }
      const sourceClass = Connectors.GoogleSheets.GoogleSheetsSource as {
        prototype: {
          fetchFieldsSchema(): Promise<unknown>;
          fetchFieldOptions(field: string): Promise<unknown>;
        };
      };
      type PreviewSource = { context: { getParameter(name: string): unknown } };
      const fields = jest
        .spyOn(sourceClass.prototype, 'fetchFieldsSchema')
        .mockImplementation(async function (this: PreviewSource) {
          expect(JSON.stringify(this.context.getParameter('AuthType'))).toContain(key);
          return { sheet: { uniqueKeys: ['id'], fields: { id: { type: 'STRING' } } } };
        });
      const options = jest
        .spyOn(sourceClass.prototype, 'fetchFieldOptions')
        .mockImplementation(async function (this: PreviewSource, field) {
          expect(field).toBe('SheetName');
          expect(JSON.stringify(this.context.getParameter('AuthType'))).toContain(key);
          expect(this.context.getParameter('SpreadsheetId')).toMatchObject({
            value: 'other-sheet',
          });
          return [{ value: 'Sheet2', label: 'Sheet 2' }];
        });
      const input = {
        connector_name: 'GoogleSheets',
        source_data_mart_id: mart.id,
        source_configuration_id: sourceId,
      };
      const fieldsTool = app.get(PreviewConnectorFieldsTool);
      const result = await fieldsTool.handler(input, admin);
      expect(z.object(fieldsTool.outputSchema).parse(result.structuredContent)).toMatchObject({
        nodes: [{ name: 'sheet', fields: [{ name: 'id', type: 'STRING' }] }],
      });
      const optionsTool = app.get(PreviewConnectorFieldOptionsTool);
      const optionResult = await optionsTool.handler(
        { ...input, field: 'SheetName', configuration: { SpreadsheetId: 'other-sheet' } },
        admin
      );
      expect(optionResult.structuredContent).toMatchObject({
        options: [{ value: 'Sheet2', label: 'Sheet 2' }],
      });
      expect(JSON.stringify([result, optionResult])).not.toContain(key);
      expect(fields).toHaveBeenCalledTimes(1);
      expect(options).toHaveBeenCalledTimes(1);
      expect(await readDefinition(mart.id)).toEqual(before);
      await setup.updateDataMartAvailability(admin, {
        dataMartId: mart.id,
        availableForReporting: true,
        availableForMaintenance: false,
      });
      await expect(fieldsTool.handler(input, editor)).rejects.toThrow(ForbiddenException);
      await expect(optionsTool.handler({ ...input, field: 'SheetName' }, editor)).rejects.toThrow(
        ForbiddenException
      );
      expect(fields).toHaveBeenCalledTimes(1);
      expect(options).toHaveBeenCalledTimes(1);
    }
  );
});
