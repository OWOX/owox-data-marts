import { NotFoundException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpConnectorsFacade } from '../../../../data-marts/facades/mcp-connectors.facade';
import { connectorNodes } from './connector-tool.fixtures';
import { GetConnectorFieldsTool } from './get-connector-fields.tool';

describe('GetConnectorFieldsTool', () => {
  const facade = { getConnectorFields: jest.fn() };
  const tool = new GetConnectorFieldsTool(facade as unknown as McpConnectorsFacade);

  beforeEach(() => jest.resetAllMocks());

  it('forwards trusted context and preserves the connector node and field vocabulary', async () => {
    facade.getConnectorFields.mockResolvedValue(connectorNodes);
    const result = await tool.handler({ connector_name: 'CustomOrders', version: 3 }, mcpContext);

    expect(facade.getConnectorFields).toHaveBeenCalledWith(setupContext, {
      connectorName: 'CustomOrders',
      version: 3,
    });
    expect(result).toEqual({
      structuredContent: expect.objectContaining({ nodes: connectorNodes }),
      content: [{ type: 'text', text: JSON.stringify(result.structuredContent, null, 2) }],
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toMatchObject({
      nodes: connectorNodes,
    });
  });

  it('uses the default version and permits an empty static schema', async () => {
    facade.getConnectorFields.mockResolvedValue([]);
    expect(
      (await tool.handler({ connector_name: 'Stripe' }, mcpContext)).structuredContent
    ).toMatchObject({
      nodes: [],
    });
    expect(facade.getConnectorFields).toHaveBeenCalledWith(setupContext, {
      connectorName: 'Stripe',
    });
  });

  it.each([
    {},
    { connector_name: '' },
    { connector_name: '   ' },
    { connector_name: 'Stripe', version: 0 },
    { connector_name: 'Stripe', version: -1 },
    { connector_name: 'Stripe', version: 1.5 },
    { connector_name: 'Stripe', version: '2' },
    { connector_name: 'Stripe', user_id: 'other' },
    { connector_name: 'Stripe', roles: ['admin'] },
  ])('rejects invalid static-field requests %j before execution', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.getConnectorFields).not.toHaveBeenCalled();
  });

  it('propagates missing or unpublished connector errors', async () => {
    const error = new NotFoundException('Published connector version not found');
    facade.getConnectorFields.mockRejectedValueOnce(error);
    await expect(tool.handler({ connector_name: 'CustomOrders' }, mcpContext)).rejects.toBe(error);
  });

  it('advertises explicit serializable node schemas and read access', () => {
    expect(z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' }).properties).toHaveProperty(
      'connector_name'
    );
    expect(z.toJSONSchema(z.object(tool.outputSchema)).properties).toHaveProperty('nodes');
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
  });
});
