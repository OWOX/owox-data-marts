import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import type { IdpProjectionsFacade } from '../../../../../idp/facades/idp-projections.facade';
import type { McpProjectSetupFacade } from '../../../../../project-settings/facades/mcp-project-setup.facade';
import { UpdateProjectDescriptionTool } from './update-project-description.tool';

describe('UpdateProjectDescriptionTool', () => {
  const context = {
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['admin'],
    scopes: ['mcp:read', 'mcp:write'],
  } as McpAuthContext;
  let update: jest.Mock;
  let lookup: jest.Mock;
  let tool: UpdateProjectDescriptionTool;

  beforeEach(() => {
    update = jest.fn(async request => ({
      description: request.description?.trim() ?? null,
      revision: 2,
    }));
    lookup = jest.fn().mockResolvedValue({ id: 'project-1', roles: ['admin'] });
    tool = new UpdateProjectDescriptionTool(
      new SetupAuthorizationService({
        getProjectForUser: lookup,
      } as unknown as IdpProjectionsFacade),
      { updateProjectDescription: update } as unknown as McpProjectSetupFacade
    );
  });

  it('maps only authorized actor and expected revision and returns saved Markdown', async () => {
    const result = await tool.handler(
      { description: '  # Saved\n\nMarkdown  ', expected_revision: 1 },
      context
    );
    expect(update).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['admin'],
      description: '  # Saved\n\nMarkdown  ',
      expectedRevision: 1,
    });
    expect(result.structuredContent).toEqual({ description: '# Saved\n\nMarkdown', revision: 2 });
    expect(z.object(tool.outputSchema).safeParse(result.structuredContent).success).toBe(true);
  });

  it('requires both scopes even through a direct call', async () => {
    await expect(
      tool.handler(
        { description: null, expected_revision: 1 },
        { ...context, scopes: ['mcp:read'] }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { description: '' },
    { description: ' \n ' },
    { description: 'x'.repeat(10001) },
    { description: ' '.repeat(10000) + 'x' },
    { description: null, expected_revision: -1 },
    { description: null, expected_revision: 0, userId: 'attacker' },
  ])('rejects invalid input before writing (%j)', async input => {
    await expect(
      tool.handler({ expected_revision: 0, ...input } as never, context)
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it('requires an explicit revision', async () => {
    await expect(tool.handler({ description: null } as never, context)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts exactly 10,000 characters and explicit null', async () => {
    await tool.handler({ description: 'x'.repeat(10000), expected_revision: 0 }, context);
    await tool.handler({ description: null, expected_revision: 1 }, context);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('propagates a domain conflict without retrying the write', async () => {
    update.mockRejectedValue(new Error('Conflict'));
    await expect(
      tool.handler({ description: null, expected_revision: 1 }, context)
    ).rejects.toThrow('Conflict');
    expect(update).toHaveBeenCalledTimes(1);
  });
});
