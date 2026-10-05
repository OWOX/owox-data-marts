import { z } from 'zod-v4';
import { ListContextsTool } from './list-contexts.tool';
import { contextIdsSchema } from './context-input';
import type { McpAuthContext } from '../auth/mcp-auth-context';

describe('ListContextsTool', () => {
  const facade = {
    listContexts: jest.fn(),
    validateContextIds: jest.fn(),
    getDataMartContexts: jest.fn(),
  };
  const tool = new ListContextsTool(facade);
  const context = { projectId: 'connected-project' } as McpAuthContext;
  it('returns the full Markdown description and null and rejects project overrides', async () => {
    const contexts = [
      {
        id: 'c',
        name: 'Marketing',
        description:
          '# Goal\n[Mart](https://app.owox.com/ui/p/data-marts/id/data-setup)\n' +
          'text'.repeat(5000),
      },
      { id: 'n', name: 'Empty', description: null },
    ];
    facade.listContexts.mockResolvedValue(contexts);
    const result = await tool.handler({}, context);
    expect(result.structuredContent).toEqual({ contexts });
    expect(facade.listContexts).toHaveBeenCalledWith('connected-project');
    await expect(tool.handler({ project_id: 'foreign' } as never, context)).rejects.toThrow();
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.requiredScopes).toEqual(['mcp:read']);
  });
  it('publishes a serializable optional context filter and preserves no-filter semantics', () => {
    const schema = z.object({ context_ids: contextIdsSchema });
    expect(z.toJSONSchema(schema, { io: 'input' }).properties?.context_ids).toMatchObject({
      type: 'array',
      maxItems: 100,
    });
    expect(schema.parse({ context_ids: [] }).context_ids).toBeUndefined();
    expect(schema.parse({ context_ids: [' c ', 'c', 'd'] }).context_ids).toEqual(['c', 'd']);
    expect(() => schema.parse({ context_ids: [''] })).toThrow();
  });
});
