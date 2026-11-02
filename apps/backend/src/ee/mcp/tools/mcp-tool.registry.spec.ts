import { z } from 'zod';
import { McpToolRegistry } from './mcp-tool.registry';
import type { McpToolDefinition } from './mcp-tool.definition';

describe('McpToolRegistry', () => {
  const tool = (name: string): McpToolDefinition => ({
    name,
    description: `${name} description`,
    zodSchema: {},
    requiredScopes: ['mcp:read'],
    handler: jest.fn(),
  });

  it('exposes explicitly injected tools only', () => {
    const tools = [tool('list_data_marts')];
    const registry = new McpToolRegistry(tools);

    expect(registry.getTools()).toBe(tools);
    expect(registry.getTool('list_data_marts')).toBe(tools[0]);
    expect(registry.getTool('query_data_mart')).toBeUndefined();
  });

  it('rejects duplicate tool names', () => {
    expect(() => new McpToolRegistry([tool('list_data_marts'), tool('list_data_marts')])).toThrow(
      'Duplicate MCP tool name: list_data_marts'
    );
  });

  it('keeps tool schemas as Zod raw shapes for SDK registration', () => {
    const tools: McpToolDefinition[] = [
      {
        ...tool('list_data_marts'),
        zodSchema: {
          status: z.string().optional(),
        },
      },
    ];

    expect(new McpToolRegistry(tools).getTool('list_data_marts')?.zodSchema).toEqual({
      status: expect.any(Object),
    });
  });
});
