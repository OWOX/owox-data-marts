import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpContextsFacade } from '../../../../data-marts/facades/mcp-contexts.facade';
import { SetContextMembersTool } from './set-context-members.tool';

describe('SetContextMembersTool', () => {
  const facade = { setContextMembers: jest.fn() };
  const tool = new SetContextMembersTool(facade as unknown as McpContextsFacade);

  beforeEach(() => jest.resetAllMocks());

  it('returns assigned users and dropped admins from the facade in the connected project', async () => {
    facade.setContextMembers.mockResolvedValue({
      assignedUserIds: ['member'],
      droppedAdminIds: ['admin'],
    });
    const output = { assigned_user_ids: ['member'], dropped_admin_ids: ['admin'] };

    const result = await tool.handler(
      { context_id: 'context', assigned_user_ids: ['member', 'admin'] },
      mcpContext
    );

    expect(facade.setContextMembers).toHaveBeenCalledWith(setupContext, {
      contextId: 'context',
      assignedUserIds: ['member', 'admin'],
    });
    expect(result).toEqual({
      structuredContent: output,
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(output);
  });

  it.each([
    { label: 'empty', assignedUserIds: [] },
    { label: 'maximum size', assignedUserIds: Array(1000).fill('member') },
  ])('accepts the $label API membership replacement list', async ({ assignedUserIds }) => {
    facade.setContextMembers.mockResolvedValue({ assignedUserIds, droppedAdminIds: [] });

    const result = await tool.handler(
      { context_id: 'context', assigned_user_ids: assignedUserIds },
      mcpContext
    );

    expect(facade.setContextMembers).toHaveBeenCalledWith(setupContext, {
      contextId: 'context',
      assignedUserIds,
    });
    expect(result.structuredContent).toEqual({
      assigned_user_ids: assignedUserIds,
      dropped_admin_ids: [],
    });
  });

  it.each([
    { context_id: '', assigned_user_ids: [] },
    { context_id: 'context' },
    { context_id: 'context', assigned_user_ids: [''] },
    { context_id: 'context', assigned_user_ids: Array(1001).fill('member') },
  ])('rejects invalid input before calling the facade: %p', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.setContextMembers).not.toHaveBeenCalled();
  });

  it.each(['project_id', 'user_id', 'roles'])(
    'rejects a caller-supplied %s before calling the facade',
    async field => {
      await expect(
        tool.handler(
          { context_id: 'context', assigned_user_ids: [], [field]: 'foreign' } as never,
          mcpContext
        )
      ).rejects.toThrow();
      expect(facade.setContextMembers).not.toHaveBeenCalled();
    }
  );

  it('propagates the facade authorization error', async () => {
    const error = new ForbiddenException('Admin required');
    facade.setContextMembers.mockRejectedValue(error);

    await expect(
      tool.handler({ context_id: 'context', assigned_user_ids: [] }, mcpContext)
    ).rejects.toBe(error);
  });

  it('declares the write scope and replacement annotations', () => {
    expect(tool.requiredScopes).toEqual(['mcp:write']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });
});
