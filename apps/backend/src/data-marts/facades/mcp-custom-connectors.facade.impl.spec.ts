import { ListCustomConnectorsService } from '../use-cases/custom-connectors/list-custom-connectors.service';
import { GetCustomConnectorService } from '../use-cases/custom-connectors/get-custom-connector.service';
import { CreateCustomConnectorService } from '../use-cases/custom-connectors/create-custom-connector.service';
import { UpdateCustomConnectorMetadataService } from '../use-cases/custom-connectors/update-custom-connector-metadata.service';
import { GetCustomConnectorVersionService } from '../use-cases/custom-connectors/get-custom-connector-version.service';
import { SaveCustomConnectorDraftService } from '../use-cases/custom-connectors/save-custom-connector-draft.service';
import { PublishCustomConnectorService } from '../use-cases/custom-connectors/publish-custom-connector.service';
import { ActivateCustomConnectorVersionService } from '../use-cases/custom-connectors/activate-custom-connector-version.service';
import { DeleteCustomConnectorService } from '../use-cases/custom-connectors/delete-custom-connector.service';
import { GetCustomConnectorSpecificationService } from '../use-cases/custom-connectors/get-custom-connector-specification.service';
import { GetCustomConnectorFieldsService } from '../use-cases/custom-connectors/get-custom-connector-fields.service';
import { TestCustomConnectorService } from '../use-cases/custom-connectors/test-custom-connector.service';
import { ConnectorDefinitionMapper } from '../mappers/connector-definition.mapper';
import { ConnectorMapper } from '../mappers/connector.mapper';
import { McpCustomConnectorsFacadeImpl } from './mcp-custom-connectors.facade.impl';

jest.mock('../services/connector/connector-definition.service', () => ({
  ConnectorDefinitionService: jest.fn(),
}));
jest.mock('../services/connector/connector.service', () => ({ ConnectorService: jest.fn() }));
jest.mock('../services/connector/connector-test.service', () => ({
  ConnectorTestService: jest.fn(),
}));

describe('McpCustomConnectorsFacadeImpl', () => {
  const actor = { projectId: 'project', userId: 'editor', roles: ['editor'] };
  const manifest = { name: 'CustomApi', arbitrary: 'private authoring value' };
  const definition = {
    id: 'connector',
    projectId: 'project',
    createdById: 'editor',
    name: 'CustomApi',
    title: 'Custom API',
    activeVersionId: 'version-id',
    internal: 'never expose',
  };
  const version = {
    id: 'version-id',
    connectorDefinitionId: 'connector',
    version: 1,
    status: 'draft',
    manifest,
    createdById: 'editor',
  };
  let definitions: Record<string, jest.Mock>;
  let connector: Record<string, jest.Mock>;
  let tester: { runTest: jest.Mock };
  let facade: McpCustomConnectorsFacadeImpl;

  beforeEach(() => {
    definitions = {
      listByProject: jest.fn().mockResolvedValue([definition]),
      getActiveVersionNumbersByDefId: jest.fn().mockResolvedValue(new Map([['connector', 1]])),
      getById: jest.fn().mockResolvedValue(definition),
      listVersions: jest.fn().mockResolvedValue([version]),
      getActiveVersionNumberForDef: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue(definition),
      updateMetadata: jest.fn().mockResolvedValue(definition),
      getVersion: jest.fn().mockResolvedValue(version),
      saveDraft: jest.fn().mockResolvedValue(version),
      publish: jest.fn().mockResolvedValue({ version, warnings: ['Check parameter attributes'] }),
      setActiveVersion: jest.fn().mockResolvedValue(definition),
      softDelete: jest.fn().mockResolvedValue(undefined),
      resolveManifest: jest.fn().mockResolvedValue(manifest),
    };
    connector = {
      getSpecificationFromManifest: jest.fn().mockReturnValue([
        {
          name: 'Auth',
          oneOf: [
            {
              label: 'OAuth',
              value: 'oauth',
              oauthParams: { secret: 'hidden' },
              items: { Token: { name: 'Token', attributes: ['SECRET'] } },
            },
          ],
        },
      ]),
      getFieldsSchemaFromManifest: jest.fn().mockReturnValue([
        {
          name: 'items',
          uniqueKeys: ['id'],
          fields: [{ name: 'id', type: 'string' }],
        },
      ]),
    };
    tester = {
      runTest: jest.fn().mockResolvedValue({ rows: [], logs: [], error: null, sample: [] }),
    };
    facade = new McpCustomConnectorsFacadeImpl(
      new ListCustomConnectorsService(definitions as never, new ConnectorDefinitionMapper()),
      new GetCustomConnectorService(definitions as never, new ConnectorDefinitionMapper()),
      new CreateCustomConnectorService(definitions as never, new ConnectorDefinitionMapper()),
      new UpdateCustomConnectorMetadataService(
        definitions as never,
        new ConnectorDefinitionMapper()
      ),
      new GetCustomConnectorVersionService(definitions as never, new ConnectorDefinitionMapper()),
      new SaveCustomConnectorDraftService(definitions as never, new ConnectorDefinitionMapper()),
      new PublishCustomConnectorService(definitions as never, new ConnectorDefinitionMapper()),
      new ActivateCustomConnectorVersionService(
        definitions as never,
        new ConnectorDefinitionMapper()
      ),
      new DeleteCustomConnectorService(definitions as never),
      new GetCustomConnectorSpecificationService(
        definitions as never,
        connector as never,
        new ConnectorMapper()
      ),
      new GetCustomConnectorFieldsService(
        definitions as never,
        connector as never,
        new ConnectorMapper()
      ),
      new TestCustomConnectorService(tester as never),
      new ConnectorDefinitionMapper()
    );
  });

  it('returns public metadata and version summaries without persistence fields or manifests', async () => {
    const result = await facade.list(actor.projectId);
    expect(definitions.listByProject).toHaveBeenCalledWith('project');
    expect(result).toEqual([
      {
        id: 'connector',
        name: 'CustomApi',
        title: 'Custom API',
        description: null,
        logo: null,
        docUrl: null,
        activeVersionId: 'version-id',
        activeVersion: 1,
      },
    ]);
    const detail = await facade.get(actor.projectId, 'connector');
    expect(detail.versions).toEqual([{ version: 1, status: 'draft', publishedAt: null }]);
    expect(JSON.stringify(detail)).not.toContain('private authoring value');
    expect(definitions.listVersions).toHaveBeenCalledWith('project', 'connector');
  });

  it('returns the requested manifest version without persistence metadata', async () => {
    expect(await facade.getVersion('project', 'connector', 1)).toEqual({
      version: 1,
      status: 'draft',
      manifest,
    });
    expect(definitions.getVersion).toHaveBeenCalledWith('project', 'connector', 1);
  });

  it('returns public schemas for the requested project and published version', async () => {
    const spec = await facade.getSpecification('project', 'connector', 2);
    expect(spec).toMatchObject([
      { name: 'Auth', oneOf: [{ items: { Token: { attributes: ['SECRET'] } } }] },
    ]);
    expect(JSON.stringify(spec)).not.toContain('hidden');
    expect(JSON.stringify(spec)).not.toContain('oauthParams');
    expect(definitions.resolveManifest).toHaveBeenCalledWith('project', 'CustomApi', 2);
    expect(await facade.getFields('project', 'connector')).toEqual([
      {
        name: 'items',
        uniqueKeys: ['id'],
        fields: [{ name: 'id', type: 'string' }],
      },
    ]);
    expect(definitions.resolveManifest).toHaveBeenLastCalledWith('project', 'CustomApi', undefined);
    expect(definitions.getById).toHaveBeenCalledWith('project', 'connector');
  });
});
