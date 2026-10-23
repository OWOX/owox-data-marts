import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import {
  dataMartConfiguration,
  mcpContext,
  setupContext,
} from '../../../../../test/fixtures/mcp-configuration';
import {
  DataMartDefinitionType,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { UpdateDataMartDefinitionTool } from './update-data-mart-definition.tool';

describe('UpdateDataMartDefinitionTool', () => {
  const facade = { updateDataMartDefinition: jest.fn() };
  const tool = new UpdateDataMartDefinitionTool(facade as unknown as McpDataMartSetupFacade);

  beforeEach(() => jest.resetAllMocks());

  it('separates the source discriminator from its body and omits unused credential-copy options', async () => {
    const configuration = {
      ...dataMartConfiguration,
      definitionType: DataMartDefinitionType.SQL,
      definition: { sqlQuery: 'SELECT 1' },
    };
    facade.updateDataMartDefinition.mockResolvedValue(configuration);
    const result = await tool.handler(
      {
        data_mart_id: 'mart-1',
        definition: { type: DataMartDefinitionType.SQL, sqlQuery: 'SELECT 1' },
      },
      mcpContext
    );
    expect(facade.updateDataMartDefinition).toHaveBeenCalledWith(setupContext, {
      dataMartId: 'mart-1',
      definitionType: 'SQL',
      definition: { sqlQuery: 'SELECT 1' },
    });
    expect(result.structuredContent).toEqual({ data_mart: configuration });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
    expect(tool.requiredScopes).toEqual(['mcp:write']);
  });

  it('preserves connector configuration and source-copy parameters', async () => {
    const definition = {
      connector: {
        source: {
          name: 'test',
          configuration: [{ account: 'abc' }],
          node: 'orders',
          fields: ['id'],
          version: 2,
        },
        storage: { fullyQualifiedName: 'project.dataset.orders' },
      },
    };
    facade.updateDataMartDefinition.mockResolvedValue({
      ...dataMartConfiguration,
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition,
    });
    await tool.handler(
      {
        data_mart_id: 'mart-1',
        definition: { type: DataMartDefinitionType.CONNECTOR, ...definition },
        source_data_mart_id: '74a95ec1-9e97-4b26-bec6-ae0957a62043',
        source_configuration_id: 'configuration-1',
      },
      mcpContext
    );
    expect(facade.updateDataMartDefinition).toHaveBeenCalledWith(setupContext, {
      dataMartId: 'mart-1',
      definitionType: 'CONNECTOR',
      definition,
      sourceDataMartId: '74a95ec1-9e97-4b26-bec6-ae0957a62043',
      sourceConfigurationId: 'configuration-1',
    });
  });

  it.each([
    {
      data_mart_id: 'mart-1',
      definition: { type: 'SQL', fullyQualifiedName: 'project.dataset.table' },
    },
    { data_mart_id: 'mart-1', definition: { type: 'SQL', sqlQuery: '' } },
    { data_mart_id: '', definition: { type: 'SQL', sqlQuery: 'SELECT 1' } },
    {
      data_mart_id: 'mart-1',
      definition: { type: 'SQL', sqlQuery: 'SELECT 1' },
      source_data_mart_id: 'not-a-uuid',
    },
    {
      data_mart_id: 'mart-1',
      definition: { type: 'SQL', sqlQuery: 'SELECT 1' },
      project_id: 'foreign',
    },
    { data_mart_id: 'mart-1', definition: { type: 'SQL', sqlQuery: 'SELECT 1' }, user_id: 'other' },
    { data_mart_id: 'mart-1', definition: { type: 'SQL', sqlQuery: 'SELECT 1' }, roles: ['admin'] },
  ])('rejects mismatched, invalid or untrusted definitions %j before mutation', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.updateDataMartDefinition).not.toHaveBeenCalled();
  });

  it('propagates target and source authorization failures', async () => {
    const error = new ForbiddenException('Cannot edit source');
    facade.updateDataMartDefinition.mockRejectedValue(error);
    await expect(
      tool.handler(
        {
          data_mart_id: 'mart-1',
          definition: { type: DataMartDefinitionType.SQL, sqlQuery: 'SELECT 1' },
        },
        mcpContext
      )
    ).rejects.toBe(error);
  });

  it.each([
    { source_data_mart_id: '74a95ec1-9e97-4b26-bec6-ae0957a62043' },
    { source_configuration_id: 'configuration-1' },
    { source_data_mart_id: '74a95ec1-9e97-4b26-bec6-ae0957a62043', source_configuration_id: '' },
  ])('requires both nonempty public copy IDs before mutation: %j', async copy => {
    await expect(
      tool.handler(
        {
          data_mart_id: 'mart-1',
          definition: {
            type: DataMartDefinitionType.CONNECTOR,
            connector: {
              source: { name: 'GoogleSheets', configuration: [{}], node: 'sheets', fields: ['id'] },
              storage: { fullyQualifiedName: 'dataset.target' },
            },
          },
          ...copy,
        },
        mcpContext
      )
    ).rejects.toThrow();
    expect(facade.updateDataMartDefinition).not.toHaveBeenCalled();
  });

  it.each(['SQL', 'multiple-configurations'])(
    'rejects public copy IDs for %s before mutation',
    async scenario => {
      const definition =
        scenario === 'SQL'
          ? { type: DataMartDefinitionType.SQL as const, sqlQuery: 'SELECT 1' }
          : {
              type: DataMartDefinitionType.CONNECTOR as const,
              connector: {
                source: {
                  name: 'GoogleSheets',
                  configuration: [{}, {}],
                  node: 'sheets',
                  fields: ['id'],
                },
                storage: { fullyQualifiedName: 'dataset.target' },
              },
            };
      await expect(
        tool.handler(
          {
            data_mart_id: 'mart-1',
            definition,
            source_data_mart_id: '74a95ec1-9e97-4b26-bec6-ae0957a62043',
            source_configuration_id: 'configuration-1',
          },
          mcpContext
        )
      ).rejects.toThrow();
      expect(facade.updateDataMartDefinition).not.toHaveBeenCalled();
    }
  );
});
