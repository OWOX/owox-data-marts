import { ConflictException } from '@nestjs/common';
import { z } from 'zod-v4';
import { adminMcpContext, mcpProjectActor } from '../../../../../test/fixtures/mcp-auth-context';
import type { McpContextsFacade } from '../../../../data-marts/facades/mcp-contexts.facade';
import { DeleteContextTool } from './delete-context.tool';

describe('DeleteContextTool', () => {
  const facade = { deleteContext: jest.fn() };
  const tool = new DeleteContextTool(facade as unknown as McpContextsFacade);

  beforeEach(() => jest.resetAllMocks());

  it('confirms deletion in the connected project after the facade succeeds', async () => {
    facade.deleteContext.mockResolvedValue(undefined);
    const output = { context_id: 'context', status: 'deleted' };

    const result = await tool.handler({ context_id: 'context' }, adminMcpContext);

    expect(facade.deleteContext).toHaveBeenCalledWith(mcpProjectActor, { contextId: 'context' });
    expect(result).toEqual({
      structuredContent: output,
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(output);
  });

  it('does not confirm deletion when the facade reports attached resources', async () => {
    const conflict = new ConflictException('Detach Context resources first');
    facade.deleteContext.mockRejectedValue(conflict);

    await expect(tool.handler({ context_id: 'context' }, adminMcpContext)).rejects.toBe(conflict);
  });

  it.each([{}, { context_id: '' }, { context_id: 1 }])(
    'rejects invalid input before calling the facade: %p',
    async input => {
      await expect(tool.handler(input as never, adminMcpContext)).rejects.toThrow(z.ZodError);
      expect(facade.deleteContext).not.toHaveBeenCalled();
    }
  );

  it.each(['project_id', 'user_id', 'roles'])(
    'rejects a caller-supplied %s on direct handler calls',
    async field => {
      await expect(
        tool.handler({ context_id: 'context', [field]: 'foreign' } as never, adminMcpContext)
      ).rejects.toThrow(z.ZodError);
      expect(facade.deleteContext).not.toHaveBeenCalled();
    }
  );

  it('declares the write scope and deletion annotations', () => {
    expect(tool.requiredScopes).toEqual(['mcp:write']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });
});
