jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { McpConnectorsMapper } from '../mappers/mcp-connectors.mapper';
import { Action, EntityType } from '../services/access-decision';
import {
  ConnectorSecretService,
  SECRET_MASK,
} from '../services/connector/connector-secret.service';
import { McpConnectorsFacadeImpl } from './mcp-connectors.facade.impl';

describe('McpConnectorsFacadeImpl', () => {
  const actor = { projectId: 'project', userId: 'user', roles: ['editor'] };
  const connectorService = {
    getAvailableConnectors: jest.fn(),
    getConnectorCapabilities: jest.fn(),
    resolveConnectorCapabilities: jest.fn(),
    resolveConnectorSpecification: jest.fn(),
    resolveConnectorFieldsSchema: jest.fn(),
  };
  const definitions = {
    listByProject: jest.fn(),
    getActiveVersionNumbersByDefId: jest.fn(),
  };
  const dataMarts = {
    findByProjectIdAndDefinitionType: jest.fn(),
    getByIdAndProjectId: jest.fn(),
  };
  const access = { canAccess: jest.fn(), canAccessMany: jest.fn() };
  const credentials = { getCredentialsByIds: jest.fn() };
  const secrets = new ConnectorSecretService(connectorService as never, credentials as never);
  const fieldsPreview = { run: jest.fn() };
  const optionsPreview = { run: jest.fn() };
  const facade = new McpConnectorsFacadeImpl(
    connectorService as never,
    definitions as never,
    dataMarts as never,
    access as never,
    secrets,
    fieldsPreview as never,
    optionsPreview as never,
    new McpConnectorsMapper()
  );
  const capabilities = { singleConfiguration: false, copySecretsByValue: false };
  const nodes = [
    {
      name: 'sheets',
      overview: 'Spreadsheet rows',
      description: 'Rows in the selected sheet',
      documentation: 'https://docs.example.com/sheets',
      uniqueKeys: ['id'],
      uniqueKeysByDataLevel: { row: ['id'] },
      defaultFields: ['id'],
      destinationName: 'sheets',
      fields: [{ name: 'id', type: 'string', description: 'Row ID' }],
    },
  ];
  const sourceConfiguration = {
    _id: 'legacy-config:1',
    _secrets_id: 'secret-record',
    _copiedFrom: { dataMartId: 'old-source', configId: 'old-config' },
    SpreadsheetId: 'spreadsheet-1',
    SheetId: 'sheet-1',
    AuthType: { oauth2: { _source_credential_id: 'oauth-record', Token: 'inline-token' } },
  };
  const source = (
    overrides: Partial<DataMart> = {}
  ): DataMart & { definition: ConnectorDefinition } =>
    ({
      id: 'source-mart',
      title: 'Source sheets',
      projectId: 'project',
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: {
        connector: {
          source: {
            name: 'GoogleSheets',
            version: 2,
            configuration: [structuredClone(sourceConfiguration)],
            node: 'sheets',
            fields: ['id'],
          },
          storage: { fullyQualifiedName: 'project.dataset.table' },
        },
      },
      ...overrides,
    }) as DataMart & { definition: ConnectorDefinition };

  beforeEach(() => {
    jest.resetAllMocks();
    connectorService.getAvailableConnectors.mockResolvedValue([]);
    connectorService.getConnectorCapabilities.mockReturnValue(capabilities);
    connectorService.resolveConnectorCapabilities.mockResolvedValue(capabilities);
    connectorService.resolveConnectorSpecification.mockResolvedValue([
      { name: 'Token', attributes: ['SECRET'] },
      { name: 'ServiceAccountKey', attributes: ['SECRET'] },
    ]);
    connectorService.resolveConnectorFieldsSchema.mockResolvedValue(nodes);
    definitions.listByProject.mockResolvedValue([]);
    definitions.getActiveVersionNumbersByDefId.mockResolvedValue(new Map());
    dataMarts.findByProjectIdAndDefinitionType.mockResolvedValue([]);
    dataMarts.getByIdAndProjectId.mockResolvedValue(source());
    access.canAccess.mockResolvedValue(true);
    access.canAccessMany.mockResolvedValue(new Map([['source-mart', true]]));
    credentials.getCredentialsByIds.mockResolvedValue(
      new Map([
        [
          'secret-record',
          { credentials: { 'AuthType.service_account.ServiceAccountKey': 'stored-secret' } },
        ],
      ])
    );
    fieldsPreview.run.mockResolvedValue(nodes);
    optionsPreview.run.mockResolvedValue([{ value: 'sheet-2', label: 'Revenue' }]);
  });

  it('lists bundled and usable published project connectors without raw metadata', async () => {
    connectorService.getAvailableConnectors.mockResolvedValue([
      {
        name: 'GoogleSheets',
        title: 'Google Sheets',
        description: 'Read spreadsheet data',
        docUrl: 'https://docs.example.com',
        logo: 'logo-data',
        manifest: { token: 'never-return' },
      },
    ]);
    definitions.listByProject.mockResolvedValue([
      {
        id: 'custom',
        projectId: 'project',
        name: 'CustomApi',
        title: 'Custom API',
        activeVersionId: 'published',
        manifest: { token: 'never-return' },
      },
      { id: 'draft', name: 'DraftOnly', title: 'Draft only' },
      { id: 'unusable', name: 'Unusable', title: 'Unusable', activeVersionId: 'draft-version' },
    ]);
    definitions.getActiveVersionNumbersByDefId.mockResolvedValue(
      new Map([
        ['custom', 3],
        ['unusable', 1],
      ])
    );
    connectorService.getConnectorCapabilities.mockReturnValue({
      singleConfiguration: true,
      copySecretsByValue: true,
    });
    connectorService.resolveConnectorCapabilities.mockImplementation(
      async (_projectId: string, name: string) => {
        if (name === 'Unusable') throw new BadRequestException('No published version');
        return capabilities;
      }
    );

    await expect(facade.listConnectors({ ...actor, roles: ['viewer'] })).resolves.toEqual([
      {
        id: null,
        name: 'GoogleSheets',
        title: 'Google Sheets',
        description: 'Read spreadsheet data',
        docUrl: 'https://docs.example.com',
        isCustom: false,
        activeVersion: null,
        capabilities: { singleConfiguration: true, copySecretsByValue: true },
      },
      {
        id: 'custom',
        name: 'CustomApi',
        title: 'Custom API',
        description: null,
        docUrl: null,
        isCustom: true,
        activeVersion: 3,
        capabilities,
      },
    ]);
    expect(definitions.listByProject).toHaveBeenCalledWith('project');
    expect(connectorService.resolveConnectorCapabilities).toHaveBeenCalledWith(
      'project',
      'CustomApi',
      3
    );
  });

  it('propagates unexpected connector lookup failures instead of hiding them', async () => {
    definitions.listByProject.mockResolvedValue([{ id: 'custom', name: 'CustomApi' }]);
    definitions.getActiveVersionNumbersByDefId.mockResolvedValue(new Map([['custom', 1]]));
    connectorService.resolveConnectorCapabilities.mockRejectedValue(new Error('Database down'));

    await expect(facade.listConnectors(actor)).rejects.toThrow('Database down');
  });

  it('resolves versioned specifications without returning OAuth internals or secret defaults', async () => {
    connectorService.resolveConnectorSpecification.mockResolvedValue([
      {
        name: 'Token',
        title: 'API token',
        attributes: ['SECRET'],
        default: 'never-return',
        options: ['never-return'],
        placeholder: 'never-return',
        oauthParams: { secret: 'never-return' },
      },
      { name: 'PageSize', requiredType: 'number', default: 100 },
    ]);

    const result = await facade.getConnectorSpecification(actor, {
      connectorName: 'CustomApi',
      version: 3,
    });

    expect(connectorService.resolveConnectorSpecification).toHaveBeenCalledWith(
      'project',
      'CustomApi',
      3
    );
    expect(result[0]).toMatchObject({ name: 'Token', title: 'API token', attributes: ['SECRET'] });
    expect(JSON.stringify(result)).not.toContain('never-return');
    expect(result[1]).toMatchObject({ name: 'PageSize', requiredType: 'number', default: 100 });
  });

  it('preserves the complete node schema from the project-aware fields resolver', async () => {
    await expect(
      facade.getConnectorFields(actor, { connectorName: 'CustomApi', version: 4 })
    ).resolves.toEqual(nodes);
    expect(connectorService.resolveConnectorFieldsSchema).toHaveBeenCalledWith(
      'project',
      'CustomApi',
      4
    );
  });

  it('returns only editable matching reusable configurations with public IDs and masked settings', async () => {
    const inaccessible = source({ id: 'hidden-mart', title: 'Hidden' });
    const unrelated = source({ id: 'unrelated-mart' });
    unrelated.definition!.connector.source.name = 'OtherConnector';
    const missingId = source({ id: 'missing-id-mart' });
    delete missingId.definition!.connector.source.configuration[0]._id;
    dataMarts.findByProjectIdAndDefinitionType.mockResolvedValue([
      source(),
      inaccessible,
      unrelated,
      missingId,
    ]);
    access.canAccessMany.mockResolvedValue(
      new Map([
        ['source-mart', true],
        ['hidden-mart', false],
        ['missing-id-mart', true],
      ])
    );

    await expect(
      facade.listConnectorConfigurations(actor, { connectorName: 'GoogleSheets' })
    ).resolves.toEqual([
      {
        dataMartId: 'source-mart',
        dataMartTitle: 'Source sheets',
        configurationId: 'legacy-config:1',
        connectorName: 'GoogleSheets',
        version: 2,
        configuration: {
          SpreadsheetId: 'spreadsheet-1',
          SheetId: 'sheet-1',
          AuthType: {
            oauth2: { Token: SECRET_MASK },
            service_account: { ServiceAccountKey: SECRET_MASK },
          },
        },
      },
    ]);
    expect(dataMarts.findByProjectIdAndDefinitionType).toHaveBeenCalledWith(
      'project',
      DataMartDefinitionType.CONNECTOR
    );
    expect(access.canAccessMany).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.DATA_MART,
      expect.arrayContaining(['source-mart', 'hidden-mart']),
      Action.EDIT,
      'project'
    );
  });

  it('resolves the selected legacy configuration ID on the server before field preview', async () => {
    const mart = source();
    dataMarts.getByIdAndProjectId.mockResolvedValue(mart);
    await expect(
      facade.previewConnectorFields(actor, {
        connectorName: 'GoogleSheets',
        sourceDataMartId: 'source-mart',
        sourceConfigurationId: 'legacy-config:1',
        configuration: {
          SheetId: 'sheet-2',
          _id: 'forged-id',
          _secrets_id: 'forged-secret',
          _copiedFrom: { dataMartId: 'forged-mart', configId: 'forged-config' },
        },
      })
    ).resolves.toEqual(nodes);

    expect(fieldsPreview.run).toHaveBeenCalledWith(actor, 'GoogleSheets', {
      ...sourceConfiguration,
      SheetId: 'sheet-2',
      _copiedFrom: { dataMartId: 'source-mart', configId: 'legacy-config:1' },
    });
    expect(mart.definition!.connector.source.configuration[0]).toEqual(sourceConfiguration);
    expect(access.canAccess).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.DATA_MART,
      'source-mart',
      Action.EDIT,
      'project'
    );
  });

  it('uses top-level overrides for an options preview of a selected source', async () => {
    await expect(
      facade.previewConnectorFieldOptions(actor, {
        connectorName: 'GoogleSheets',
        field: 'SheetId',
        sourceDataMartId: 'source-mart',
        sourceConfigurationId: 'legacy-config:1',
        configuration: { AuthType: { service_account: { ServiceAccountKey: 'inline-key' } } },
      })
    ).resolves.toEqual([{ value: 'sheet-2', label: 'Revenue' }]);
    expect(optionsPreview.run).toHaveBeenCalledWith(actor, 'GoogleSheets', 'SheetId', {
      ...sourceConfiguration,
      AuthType: { service_account: { ServiceAccountKey: 'inline-key' } },
      _copiedFrom: { dataMartId: 'source-mart', configId: 'legacy-config:1' },
    });
  });

  it('forwards inline credential references to the existing preview authorization', async () => {
    const configuration = { _secrets_id: 'foreign-secret', _id: 'configuration' };
    fieldsPreview.run.mockRejectedValue(new ForbiddenException('Credential not allowed'));

    await expect(
      facade.previewConnectorFields(actor, { connectorName: 'GoogleSheets', configuration })
    ).rejects.toThrow(ForbiddenException);
    expect(fieldsPreview.run).toHaveBeenCalledWith(actor, 'GoogleSheets', configuration);
  });

  const previews = [
    (input: object) =>
      facade.previewConnectorFields(actor, { connectorName: 'GoogleSheets', ...input }),
    (input: object) =>
      facade.previewConnectorFieldOptions(actor, {
        connectorName: 'GoogleSheets',
        field: 'SheetId',
        ...input,
      }),
  ];

  describe.each(previews)('preview source authorization', invoke => {
    it.each([
      { sourceDataMartId: 'source-mart' },
      { sourceConfigurationId: 'legacy-config:1' },
      { sourceDataMartId: 'source-mart', sourceConfigurationId: '  ' },
    ])('rejects an incomplete or empty source ID pair', async input => {
      await expect(invoke(input)).rejects.toThrow(BadRequestException);
      expect(dataMarts.getByIdAndProjectId).not.toHaveBeenCalled();
    });

    it('rejects a source outside the connected project', async () => {
      dataMarts.getByIdAndProjectId.mockRejectedValue(new NotFoundException());

      await expect(
        invoke({ sourceDataMartId: 'foreign-mart', sourceConfigurationId: 'legacy-config:1' })
      ).rejects.toThrow(NotFoundException);
      expect(dataMarts.getByIdAndProjectId).toHaveBeenCalledWith('foreign-mart', 'project');
      expect(fieldsPreview.run).not.toHaveBeenCalled();
      expect(optionsPreview.run).not.toHaveBeenCalled();
    });

    it('rejects a source the actor cannot edit', async () => {
      access.canAccess.mockResolvedValue(false);

      await expect(
        invoke({ sourceDataMartId: 'source-mart', sourceConfigurationId: 'legacy-config:1' })
      ).rejects.toThrow(ForbiddenException);
      expect(fieldsPreview.run).not.toHaveBeenCalled();
      expect(optionsPreview.run).not.toHaveBeenCalled();
    });

    it('rejects a source using a different connector', async () => {
      await expect(
        invoke({
          connectorName: 'OtherConnector',
          sourceDataMartId: 'source-mart',
          sourceConfigurationId: 'legacy-config:1',
        })
      ).rejects.toThrow(BadRequestException);
      expect(fieldsPreview.run).not.toHaveBeenCalled();
      expect(optionsPreview.run).not.toHaveBeenCalled();
    });

    it('rejects an unknown configuration in an otherwise editable source', async () => {
      await expect(
        invoke({ sourceDataMartId: 'source-mart', sourceConfigurationId: 'missing' })
      ).rejects.toThrow(NotFoundException);
      expect(fieldsPreview.run).not.toHaveBeenCalled();
      expect(optionsPreview.run).not.toHaveBeenCalled();
    });
  });

  const methods = [
    ['catalog', (ctx: typeof actor) => facade.listConnectors(ctx), 'viewer'],
    [
      'specification',
      (ctx: typeof actor) =>
        facade.getConnectorSpecification(ctx, { connectorName: 'GoogleSheets' }),
      'viewer',
    ],
    [
      'fields',
      (ctx: typeof actor) => facade.getConnectorFields(ctx, { connectorName: 'GoogleSheets' }),
      'viewer',
    ],
    [
      'configurations',
      (ctx: typeof actor) =>
        facade.listConnectorConfigurations(ctx, { connectorName: 'GoogleSheets' }),
      'editor',
    ],
    [
      'field preview',
      (ctx: typeof actor) =>
        facade.previewConnectorFields(ctx, { connectorName: 'GoogleSheets', configuration: {} }),
      'editor',
    ],
    [
      'options preview',
      (ctx: typeof actor) =>
        facade.previewConnectorFieldOptions(ctx, {
          connectorName: 'GoogleSheets',
          field: 'SheetId',
          configuration: {},
        }),
      'editor',
    ],
  ] as const;

  describe.each(methods)('%s actor requirements', (_name, invoke, role) => {
    it.each([{ userId: '' }, { projectId: ' ' }, { roles: [] }, { roles: ['unknown'] }])(
      'rejects an unauthenticated or unauthorized actor',
      async override => {
        await expect(invoke({ ...actor, ...override })).rejects.toThrow(ForbiddenException);
      }
    );

    if (role === 'editor') {
      it('rejects viewers before reading reusable secrets or making provider calls', async () => {
        await expect(invoke({ ...actor, roles: ['viewer'] })).rejects.toThrow(ForbiddenException);
        expect(dataMarts.findByProjectIdAndDefinitionType).not.toHaveBeenCalled();
        expect(fieldsPreview.run).not.toHaveBeenCalled();
        expect(optionsPreview.run).not.toHaveBeenCalled();
      });
    }
  });
});
