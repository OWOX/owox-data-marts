import type { AuthorizationContext } from '../../idp';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { McpDataMartManagementFacadeImpl } from './mcp-data-mart-management.facade.impl';
import { McpDataMartManagementMapper } from '../mappers/mcp-data-mart-management.mapper';
import { ListDataMartsService } from '../use-cases/list-data-marts.service';
import { GetDataMartService } from '../use-cases/get-data-mart.service';
import { CreateDataMartService } from '../use-cases/create-data-mart.service';
import { UpdateDataMartTitleService } from '../use-cases/update-data-mart-title.service';
import { UpdateDataMartDescriptionService } from '../use-cases/update-data-mart-description.service';
import { UpdateDataMartIconService } from '../use-cases/update-data-mart-icon.service';
import { UpdateDataMartDefinitionService } from '../use-cases/update-data-mart-definition.service';
import { ValidateDataMartDefinitionService } from '../use-cases/validate-data-mart-definition.service';
import { GetDataMartInputSourceChangeImpactService } from '../use-cases/get-data-mart-input-source-change-impact.service';
import { PublishDataMartService } from '../use-cases/publish-data-mart.service';
import { DeleteDataMartService } from '../use-cases/delete-data-mart.service';
import { ActualizeDataMartSchemaService } from '../use-cases/actualize-data-mart-schema.service';
import { UpdateDataMartSchemaService } from '../use-cases/update-data-mart-schema.service';
import { UpdateDataMartOwnersService } from '../use-cases/update-data-mart-owners.service';
import { ContextAccessService } from '../services/context/context-access.service';
import { UpdateAvailabilityService } from '../use-cases/update-availability.service';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartValidationCode } from '../data-storage-types/interfaces/data-mart-validator.interface';
import { ConnectorService } from '../services/connector/connector.service';
import { McpConnectorConfigurationService } from '../services/connector/mcp-connector-configuration.service';

describe('McpDataMartManagementFacadeImpl', () => {
  const actor: AuthorizationContext = { projectId: 'project', userId: 'member', roles: ['editor'] };
  const domainServices = [
    ListDataMartsService,
    GetDataMartService,
    CreateDataMartService,
    UpdateDataMartTitleService,
    UpdateDataMartDescriptionService,
    UpdateDataMartIconService,
    UpdateDataMartDefinitionService,
    ValidateDataMartDefinitionService,
    GetDataMartInputSourceChangeImpactService,
    PublishDataMartService,
    DeleteDataMartService,
    ActualizeDataMartSchemaService,
    UpdateDataMartSchemaService,
    UpdateDataMartOwnersService,
  ];
  const mocks = new Map(domainServices.map(service => [service, { run: jest.fn() }]));
  const contexts = { updateDataMartContexts: jest.fn() };
  const sharing = { updateDataMartSharing: jest.fn() };
  const summary = { id: 'mart', title: 'Orders', status: 'DRAFT' };
  const mapper = { toSummary: jest.fn().mockReturnValue(summary), toSetup: jest.fn() };
  const connectors = {
    resolveConnectorSpecification: jest.fn(),
    resolveSourceKeys: jest.fn(),
  };
  let facade: McpDataMartManagementFacadeImpl;

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const mock of mocks.values()) mock.run.mockReset().mockResolvedValue({ id: 'mart' });
    connectors.resolveConnectorSpecification.mockResolvedValue([
      { name: 'Limit', requiredType: 'number' },
      { name: 'Enabled', requiredType: 'boolean' },
      { name: 'Filter', requiredType: 'object' },
      { name: 'Password', attributes: ['SECRET'] },
      {
        name: 'AuthType',
        oneOf: [{ value: 'oauth2', items: { ClientId: { name: 'ClientId' } } }],
      },
    ]);
    connectors.resolveSourceKeys.mockResolvedValue({
      fields: [{ path: ['AuthType', 'oauth2'], parameters: ['ClientId'] }],
      model: null,
    });
    const module = await Test.createTestingModule({
      providers: [
        McpDataMartManagementFacadeImpl,
        ...domainServices.map(provide => ({ provide, useValue: mocks.get(provide) })),
        { provide: ContextAccessService, useValue: contexts },
        { provide: UpdateAvailabilityService, useValue: sharing },
        { provide: McpDataMartManagementMapper, useValue: mapper },
        McpConnectorConfigurationService,
        { provide: ConnectorService, useValue: connectors },
      ],
    }).compile();
    facade = module.get(McpDataMartManagementFacadeImpl);
  });

  it('passes actor context and selected Storage to the shared create use case', async () => {
    await expect(facade.create(actor, { title: 'Orders', storageId: 'storage' })).resolves.toEqual(
      summary
    );
    expect(mocks.get(CreateDataMartService)!.run).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project',
        userId: 'member',
        roles: ['editor'],
        storageId: 'storage',
        title: 'Orders',
      })
    );
  });

  it('keeps draft discovery scoped and preserves paging', async () => {
    mocks
      .get(ListDataMartsService)!
      .run.mockResolvedValue({ items: [{ id: 'mart' }], total: 1001, offset: 1000 });
    await expect(
      facade.list(actor, { offset: 1000, storageId: 'storage', contextIds: ['context'] })
    ).resolves.toEqual({ items: [summary], total: 1001, offset: 1000 });
    expect(mocks.get(ListDataMartsService)!.run).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project',
        userId: 'member',
        roles: ['editor'],
        storageId: 'storage',
        contextIds: ['context'],
        includeRelationshipsCount: false,
      })
    );
  });

  it('uses the shared authorized read without legacy synchronization before mapping setup', async () => {
    mapper.toSetup.mockResolvedValue({ id: 'mart', definition: { sqlQuery: 'SELECT 1' } });
    await facade.get(actor, 'mart');
    expect(mocks.get(GetDataMartService)!.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mart',
        projectId: 'project',
        userId: 'member',
        roles: ['editor'],
        disableLegacySync: true,
      })
    );
    expect(mapper.toSetup).toHaveBeenCalledWith({ id: 'mart' });
  });

  it('forwards definitions through the same use case as HTTP', async () => {
    await facade.updateDefinition(actor, 'mart', {
      definitionType: DataMartDefinitionType.SQL,
      definition: { sqlQuery: 'SELECT 1' },
    });
    expect(mocks.get(UpdateDataMartDefinitionService)!.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mart',
        projectId: 'project',
        userId: 'member',
        roles: ['editor'],
        definitionType: 'SQL',
        definition: { sqlQuery: 'SELECT 1' },
      })
    );
  });

  const connectorInput = (configuration: Record<string, unknown>[]) => ({
    definitionType: DataMartDefinitionType.CONNECTOR,
    definition: {
      connector: {
        source: { name: 'Custom', version: 2, configuration, node: 'rows', fields: ['id'] },
        storage: { fullyQualifiedName: 'project.dataset.table' },
      },
    },
  });

  it.each([
    { api_token: 'private-value' },
    { Password: 'private-value' },
    { AuthType: { oauth2: { ClientId: 'private-value' } } },
    { AuthType: { oauth2: { api_token: 'private-value' } } },
    { Filter: { _credential_id: 'private-value' } },
  ])('rejects unsafe connector settings before the shared save: %p', async configuration => {
    await expect(
      facade.updateDefinition(actor, 'mart', connectorInput([configuration]))
    ).rejects.toThrow(BadRequestException);
    expect(mocks.get(UpdateDataMartDefinitionService)!.run).not.toHaveBeenCalled();
  });

  it('validates the whole replacement once and keeps public JSON values unchanged', async () => {
    const configurations = Array.from({ length: 100 }, (_, index) => ({
      _id: `config-${index}`,
      _credential_id: 'credential',
      Limit: '2',
      Enabled: 'true',
      Filter: { _id: 'public-id', ClientId: 'public-field', _eq: 'value' },
      AuthType: { oauth2: {} },
    }));
    const input = connectorInput(configurations);

    await expect(facade.updateDefinition(actor, 'mart', input)).resolves.toEqual(summary);

    expect(connectors.resolveConnectorSpecification).toHaveBeenCalledTimes(1);
    expect(connectors.resolveConnectorSpecification).toHaveBeenCalledWith('project', 'Custom', 2);
    expect(connectors.resolveSourceKeys).toHaveBeenCalledTimes(1);
    expect(connectors.resolveSourceKeys).toHaveBeenCalledWith('project', 'Custom', 2);
    expect(mocks.get(UpdateDataMartDefinitionService)!.run).toHaveBeenCalledWith(
      expect.objectContaining({ definition: input.definition, userId: 'member', roles: ['editor'] })
    );
  });

  it('rejects the entire replacement when a later configuration is unsafe', async () => {
    await expect(
      facade.updateDefinition(
        actor,
        'mart',
        connectorInput([{ Limit: 2 }, { api_token: 'private-value' }])
      )
    ).rejects.toThrow(BadRequestException);
    expect(mocks.get(UpdateDataMartDefinitionService)!.run).not.toHaveBeenCalled();
  });

  it('does not expose provider validation details or failure text', async () => {
    mocks.get(ValidateDataMartDefinitionService)!.run.mockResolvedValue({
      valid: false,
      errorMessage: 'password=secret',
      details: { token: 'secret' },
    });
    const result = await facade.validate(actor, 'mart');
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('reports an authored validation failure without exposing accompanying details', async () => {
    mocks.get(ValidateDataMartDefinitionService)!.run.mockResolvedValue({
      valid: false,
      code: DataMartValidationCode.STORAGE_CONFIG_NOT_FOUND,
      errorMessage: 'DataMart storage config not found',
      details: { password: 'secret' },
    });
    const result = await facade.validate(actor, 'mart');
    expect(result).toEqual({
      valid: false,
      message: 'Configure the Data Mart Storage before validating the definition.',
    });
  });

  it('returns safe schema warning reasons while dropping provider text and unknown codes', async () => {
    mocks.get(UpdateDataMartSchemaService)!.run.mockResolvedValue({
      id: 'mart',
      schema: null,
      warnings: [
        { code: 'FORMULA_WAREHOUSE_CHECK_SKIPPED', field: 'revenue', message: 'password=secret' },
        { code: 'FORMULA_UNGUARDED_DIVISION', field: 'rate', message: 'token=secret' },
        { code: 'unknown-secret', field: 'secret', message: 'secret' },
      ],
    });
    const result = await facade.updateSchema(actor, 'mart', {} as never);
    expect(result.warningCount).toBe(3);
    expect(result.warnings).toEqual([
      {
        code: 'FORMULA_WAREHOUSE_CHECK_SKIPPED',
        message: expect.stringMatching(/warehouse.*check|check.*warehouse/i),
      },
      { code: 'FORMULA_UNGUARDED_DIVISION', message: expect.stringContaining('NULLIF') },
      { code: 'SCHEMA_WARNING', message: expect.stringContaining('OWOX') },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('bounds returned warnings while preserving the total count', async () => {
    mocks.get(UpdateDataMartSchemaService)!.run.mockResolvedValue({
      schema: null,
      warnings: Array.from({ length: 60 }, () => ({
        code: 'FORMULA_UNGUARDED_DIVISION',
        field: 'rate',
        message: 'unused',
      })),
    });
    const result = await facade.updateSchema(actor, 'mart', {} as never);
    expect(result.warningCount).toBe(60);
    expect(result.warnings).toHaveLength(50);
  });

  it('preserves legacy deletion and authenticated creator attribution', async () => {
    await facade.delete(actor, 'mart');
    await facade.publish(actor, 'mart');
    expect(mocks.get(DeleteDataMartService)!.run).toHaveBeenCalledWith(
      expect.objectContaining({
        disableLegacySync: false,
        id: 'mart',
        projectId: 'project',
        userId: 'member',
        roles: ['editor'],
      })
    );
    expect(mocks.get(PublishDataMartService)!.run).toHaveBeenCalledWith(
      expect.objectContaining({ createdById: 'member', userId: 'member' })
    );
  });

  it('does not reread a Data Mart after an access change can remove the caller', async () => {
    await facade.setContexts(actor, 'mart', ['context']);
    await facade.setSharing(actor, 'mart', false, false);
    await facade.setOwners(actor, 'mart', ['owner'], []);
    expect(contexts.updateDataMartContexts).toHaveBeenCalledWith(
      'mart',
      'project',
      ['context'],
      'member',
      ['editor']
    );
    expect(sharing.updateDataMartSharing).toHaveBeenCalledWith(
      'mart',
      'project',
      'member',
      ['editor'],
      false,
      false
    );
    expect(mocks.get(UpdateDataMartOwnersService)!.run).toHaveBeenCalledWith(
      expect.objectContaining({
        businessOwnerIds: ['owner'],
        technicalOwnerIds: [],
        userId: 'member',
      })
    );
    expect(mocks.get(GetDataMartService)!.run).not.toHaveBeenCalled();
  });

  it('propagates failure instead of reporting a successful mutation', async () => {
    mocks.get(UpdateDataMartTitleService)!.run.mockRejectedValue(new Error('denied'));
    await expect(facade.updateTitle(actor, 'mart', 'New title')).rejects.toThrow('denied');
    expect(mapper.toSummary).not.toHaveBeenCalled();
  });
});
