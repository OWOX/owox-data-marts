import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpConnectorsFacade } from '../../../../data-marts/facades/mcp-connectors.facade';
import { connectorNodes, sourceDataMartId } from './connector-tool.fixtures';
import { PreviewConnectorFieldsTool } from './preview-connector-fields.tool';

describe('PreviewConnectorFieldsTool', () => {
  const facade = { previewConnectorFields: jest.fn() };
  const tool = new PreviewConnectorFieldsTool(facade as unknown as McpConnectorsFacade);

  beforeEach(() => jest.resetAllMocks());

  it('forwards non-secret overrides and the public source pair with trusted context', async () => {
    facade.previewConnectorFields.mockResolvedValue(connectorNodes);
    const result = await tool.handler(
      {
        connector_name: 'CustomOrders',
        configuration: { AccountId: 'account-2', Settings: { useSandbox: false } },
        source_data_mart_id: sourceDataMartId,
        source_configuration_id: 'configuration-1',
      },
      mcpContext
    );

    expect(facade.previewConnectorFields).toHaveBeenCalledWith(setupContext, {
      connectorName: 'CustomOrders',
      configuration: { AccountId: 'account-2', Settings: { useSandbox: false } },
      sourceDataMartId,
      sourceConfigurationId: 'configuration-1',
    });
    expect(result).toEqual({
      structuredContent: expect.objectContaining({ nodes: connectorNodes }),
      content: [{ type: 'text', text: JSON.stringify(result.structuredContent, null, 2) }],
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toMatchObject({
      nodes: connectorNodes,
    });
  });

  it('permits a preview without overrides or a reusable source', async () => {
    facade.previewConnectorFields.mockResolvedValue([]);
    expect(
      (await tool.handler({ connector_name: 'Stripe' }, mcpContext)).structuredContent
    ).toMatchObject({
      nodes: [],
    });
    expect(facade.previewConnectorFields).toHaveBeenCalledWith(setupContext, {
      connectorName: 'Stripe',
    });
  });

  it('permits selecting a reusable source without configuration overrides', async () => {
    facade.previewConnectorFields.mockResolvedValue([]);
    await tool.handler(
      {
        connector_name: 'Stripe',
        source_data_mart_id: sourceDataMartId,
        source_configuration_id: 'configuration-1',
      },
      mcpContext
    );
    expect(facade.previewConnectorFields).toHaveBeenCalledWith(setupContext, {
      connectorName: 'Stripe',
      sourceDataMartId,
      sourceConfigurationId: 'configuration-1',
    });
  });

  it.each([
    {},
    { connector_name: '' },
    { connector_name: '   ' },
    { connector_name: 'Stripe', configuration: null },
    { connector_name: 'Stripe', configuration: [] },
    { connector_name: 'Stripe', source_data_mart_id: sourceDataMartId },
    { connector_name: 'Stripe', source_configuration_id: 'configuration-1' },
    {
      connector_name: 'Stripe',
      source_data_mart_id: 'not-a-uuid',
      source_configuration_id: 'configuration-1',
    },
    {
      connector_name: 'Stripe',
      source_data_mart_id: sourceDataMartId,
      source_configuration_id: '',
    },
    { connector_name: 'Stripe', version: 3 },
    { connector_name: 'Stripe', project_id: 'foreign' },
    { connector_name: 'Stripe', roles: ['admin'] },
  ])('rejects invalid preview input %j before calling the connector', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.previewConnectorFields).not.toHaveBeenCalled();
  });

  it.each([
    new ForbiddenException('Cannot edit the source Data Mart'),
    new BadRequestException('Dynamic field preview is not supported'),
  ])('propagates access and connector support errors: %s', async error => {
    facade.previewConnectorFields.mockRejectedValueOnce(error);
    await expect(tool.handler({ connector_name: 'Stripe' }, mcpContext)).rejects.toBe(error);
  });

  it('advertises serializable node schemas and external read access', () => {
    expect(z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' }).properties).toHaveProperty(
      'source_configuration_id'
    );
    expect(z.toJSONSchema(z.object(tool.outputSchema)).properties).toHaveProperty('nodes');
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    });
  });
});
