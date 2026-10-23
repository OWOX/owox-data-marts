import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpConnectorsFacade } from '../../../../data-marts/facades/mcp-connectors.facade';
import { connectorSummary } from './connector-tool.fixtures';
import { ListConnectorsTool } from './list-connectors.tool';

describe('ListConnectorsTool', () => {
  const facade = { listConnectors: jest.fn() };
  const tool = new ListConnectorsTool(facade as unknown as McpConnectorsFacade);

  beforeEach(() => jest.resetAllMocks());

  it('maps project connector metadata using the trusted project and actor', async () => {
    facade.listConnectors.mockResolvedValue([connectorSummary]);

    const result = await tool.handler({}, mcpContext);
    const expected = {
      connectors: [
        {
          id: 'connector-1',
          name: 'CustomOrders',
          title: 'Замовлення',
          description: 'Orders from a project connector',
          doc_url: 'https://docs.example.test/orders',
          is_custom: true,
          active_version: 3,
          capabilities: { singleConfiguration: false, copySecretsByValue: true },
        },
      ],
    };

    expect(facade.listConnectors).toHaveBeenCalledWith(setupContext);
    expect(result).toEqual({
      structuredContent: expect.objectContaining(expected),
      content: [{ type: 'text', text: JSON.stringify(result.structuredContent, null, 2) }],
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toMatchObject(expected);
  });

  it('returns an empty catalog', async () => {
    facade.listConnectors.mockResolvedValue([]);
    expect((await tool.handler({}, mcpContext)).structuredContent).toMatchObject({
      connectors: [],
    });
  });

  it.each([
    { project_id: 'foreign-project' },
    { projectId: 'foreign-project' },
    { user_id: 'other-user' },
    { userId: 'other-user' },
    { roles: ['admin'] },
    { configuration: {} },
  ])('rejects untrusted input %j before catalog discovery', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.listConnectors).not.toHaveBeenCalled();
  });

  it('propagates viewer access errors', async () => {
    const error = new ForbiddenException('Connector discovery is not allowed');
    facade.listConnectors.mockRejectedValueOnce(error);
    await expect(tool.handler({}, mcpContext)).rejects.toBe(error);
  });

  it('advertises serializable catalog schemas and read access', () => {
    expect(z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' }).properties).toEqual({});
    expect(z.toJSONSchema(z.object(tool.outputSchema)).properties).toHaveProperty('connectors');
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });
});
