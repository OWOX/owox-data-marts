import { NotFoundException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpConnectorsFacade } from '../../../../data-marts/facades/mcp-connectors.facade';
import { connectorSpecification } from './connector-tool.fixtures';
import { GetConnectorSpecificationTool } from './get-connector-specification.tool';

describe('GetConnectorSpecificationTool', () => {
  const facade = { getConnectorSpecification: jest.fn() };
  const tool = new GetConnectorSpecificationTool(facade as unknown as McpConnectorsFacade);

  beforeEach(() => jest.resetAllMocks());

  it('forwards version selection and preserves nested connector parameter names', async () => {
    facade.getConnectorSpecification.mockResolvedValue(connectorSpecification);
    const result = await tool.handler({ connector_name: 'CustomOrders', version: 3 }, mcpContext);

    expect(facade.getConnectorSpecification).toHaveBeenCalledWith(setupContext, {
      connectorName: 'CustomOrders',
      version: 3,
    });
    expect(result).toEqual({
      structuredContent: expect.objectContaining({ specification: connectorSpecification }),
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.structuredContent, null, 2),
        },
      ],
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toMatchObject({
      specification: connectorSpecification,
    });
  });

  it('omits a version to use the connector default', async () => {
    facade.getConnectorSpecification.mockResolvedValue([]);
    const result = await tool.handler({ connector_name: 'Stripe' }, mcpContext);
    expect(facade.getConnectorSpecification).toHaveBeenCalledWith(setupContext, {
      connectorName: 'Stripe',
    });
    expect(result.structuredContent).toMatchObject({ specification: [] });
  });

  it.each([
    {},
    { connector_name: '' },
    { connector_name: '   ' },
    { connector_name: 'Stripe', version: 0 },
    { connector_name: 'Stripe', version: -1 },
    { connector_name: 'Stripe', version: 1.5 },
    { connector_name: 'Stripe', version: '2' },
    { connector_name: 'Stripe', project_id: 'foreign' },
    { connector_name: 'Stripe', roles: ['admin'] },
  ])('rejects invalid specification requests %j before execution', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.getConnectorSpecification).not.toHaveBeenCalled();
  });

  it('propagates missing or unpublished connector errors', async () => {
    const error = new NotFoundException('Published connector version not found');
    facade.getConnectorSpecification.mockRejectedValueOnce(error);
    await expect(
      tool.handler({ connector_name: 'CustomOrders', version: 3 }, mcpContext)
    ).rejects.toBe(error);
  });

  it('advertises explicit serializable parameter schemas and read access', () => {
    expect(z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' }).properties).toHaveProperty(
      'version'
    );
    expect(z.toJSONSchema(z.object(tool.outputSchema)).properties).toHaveProperty('specification');
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
  });
});
