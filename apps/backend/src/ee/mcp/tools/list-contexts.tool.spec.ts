import { z } from 'zod-v4';
import { ListContextsTool } from './list-contexts.tool';
import { contextIdsSchema } from './context-input';
import type { McpAuthContext } from '../auth/mcp-auth-context';

describe('ListContextsTool', () => {
  const facade = {
    createContext: jest.fn(),
    updateContextMetadata: jest.fn(),
    getContextImpact: jest.fn(),
    deleteContext: jest.fn(),
    setContextMembers: jest.fn(),
    listContexts: jest.fn(),
    validateContextIds: jest.fn(),
    getDataMartContexts: jest.fn(),
  };
  const tool = new ListContextsTool(facade);
  const context = { projectId: 'connected-project' } as McpAuthContext;
  beforeEach(() => jest.resetAllMocks());

  it('returns full descriptions and icons matching its output schema', async () => {
    const contexts = [
      {
        id: 'c',
        name: 'Marketing',
        description:
          '# Goal\n[Mart](https://app.owox.com/ui/p/data-marts/id/data-setup)\n' +
          'text'.repeat(5000),
        icon: 'lucide:megaphone',
      },
      { id: 'b', name: 'Purchases', description: null, icon: 'purchases' },
      { id: 'n', name: 'Empty', description: null, icon: null },
    ];
    facade.listContexts.mockResolvedValue(contexts);
    const result = await tool.handler({}, context);
    expect(result.structuredContent).toEqual({ contexts });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual({ contexts });
    expect(facade.listContexts).toHaveBeenCalledWith(context.projectId);
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.requiredScopes).toEqual(['mcp:read']);
  });

  it('rejects project overrides on direct handler calls before reading Contexts', async () => {
    await expect(tool.handler({ project_id: 'foreign' } as never, context)).rejects.toThrow(
      z.ZodError
    );
    expect(facade.listContexts).not.toHaveBeenCalled();
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
