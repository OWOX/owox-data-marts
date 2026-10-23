import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpConnectorsFacade } from '../../../../data-marts/facades/mcp-connectors.facade';
import { connectorConfiguration, sourceDataMartId } from './connector-tool.fixtures';
import { ListConnectorConfigurationsTool } from './list-connector-configurations.tool';

describe('ListConnectorConfigurationsTool', () => {
  const facade = { listConnectorConfigurations: jest.fn() };
  const tool = new ListConnectorConfigurationsTool(facade as unknown as McpConnectorsFacade);

  beforeEach(() => jest.resetAllMocks());

  it('exposes public source IDs and preserves masked connector configuration keys', async () => {
    facade.listConnectorConfigurations.mockResolvedValue([connectorConfiguration]);
    const result = await tool.handler({ connector_name: 'CustomOrders' }, mcpContext);
    const expected = {
      configurations: [
        {
          data_mart_id: sourceDataMartId,
          data_mart_title: 'Замовлення',
          configuration_id: 'configuration-1',
          connector_name: 'CustomOrders',
          version: 3,
          configuration: {
            SecretKey: '********',
            AccountId: 'account-1',
            Settings: { useSandbox: false, includeTags: ['new'] },
          },
        },
      ],
    };

    expect(facade.listConnectorConfigurations).toHaveBeenCalledWith(setupContext, {
      connectorName: 'CustomOrders',
    });
    expect(result.structuredContent).toMatchObject(expected);
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(result.structuredContent, null, 2) },
    ]);
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
    expect(z.object(tool.outputSchema).parse(result.structuredContent).next_steps).toEqual(
      expect.arrayContaining([
        expect.stringContaining('source_data_mart_id'),
        expect.stringContaining('source_configuration_id'),
      ])
    );
  });

  it('returns an empty list when there is no reusable source', async () => {
    facade.listConnectorConfigurations.mockResolvedValue([]);
    const result = await tool.handler({ connector_name: 'Stripe' }, mcpContext);
    expect(result.structuredContent).toMatchObject({ configurations: [] });
    expect(z.object(tool.outputSchema).parse(result.structuredContent).next_steps).toEqual(
      expect.arrayContaining([
        expect.stringContaining('create_data_mart'),
        expect.stringContaining('setup_url'),
        expect.stringContaining('list_connector_configurations'),
      ])
    );
  });

  it.each([
    {},
    { connector_name: '' },
    { connector_name: '   ' },
    { connector_name: 'Stripe', version: 3 },
    { connector_name: 'Stripe', project_id: 'foreign' },
    { connector_name: 'Stripe', user_id: 'other' },
    { connector_name: 'Stripe', roles: ['admin'] },
  ])('rejects invalid configuration discovery input %j before execution', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.listConnectorConfigurations).not.toHaveBeenCalled();
  });

  it('propagates editor access errors', async () => {
    const error = new ForbiddenException('Editor access is required');
    facade.listConnectorConfigurations.mockRejectedValueOnce(error);
    await expect(tool.handler({ connector_name: 'Stripe' }, mcpContext)).rejects.toBe(error);
  });

  it('advertises a serializable arbitrary configuration record with read access', () => {
    expect(z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' }).properties).toHaveProperty(
      'connector_name'
    );
    expect(z.toJSONSchema(z.object(tool.outputSchema)).properties).toHaveProperty('configurations');
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
  });
});
