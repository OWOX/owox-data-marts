import { NotFoundException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import { ContextDto } from '../../../../data-marts/dto/domain/context.dto';
import type { McpContextsFacade } from '../../../../data-marts/facades/mcp-contexts.facade';
import { UpdateContextTool } from './update-context.tool';

describe('UpdateContextTool', () => {
  const facade = { updateContext: jest.fn() };
  const tool = new UpdateContextTool(facade as unknown as McpContextsFacade);
  const dto = new ContextDto(
    'context',
    'Marketing',
    null,
    'project-1',
    'user-1',
    { userId: 'user-1', fullName: 'Ada', email: 'ada@example.com', avatar: null },
    new Date('2026-01-01T00:00:00.000Z'),
    new Date('2026-01-02T00:00:00.000Z')
  );
  const output = {
    id: 'context',
    name: 'Marketing',
    description: null,
    created_by_id: 'user-1',
    created_by_user: {
      user_id: 'user-1',
      full_name: 'Ada',
      email: 'ada@example.com',
      avatar: null,
    },
    created_at: '2026-01-01T00:00:00.000Z',
    modified_at: '2026-01-02T00:00:00.000Z',
  };

  beforeEach(() => jest.resetAllMocks());

  it('maps the ID and saved Context using the trusted connection context', async () => {
    facade.updateContext.mockResolvedValue(dto);

    const result = await tool.handler(
      { context_id: 'context', name: 'Marketing', description: null },
      mcpContext
    );

    expect(facade.updateContext).toHaveBeenCalledWith(setupContext, {
      contextId: 'context',
      name: 'Marketing',
      description: null,
    });
    expect(result).toEqual({
      structuredContent: output,
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(output);
  });

  it.each([
    { context_id: 'context', name: 'Marketing' },
    { context_id: 'context', name: 'Marketing', description: null },
    { context_id: 'context', name: 'Marketing', description: '' },
    { context_id: 'context', name: 'Marketing', description: '  Goals  ' },
    { context_id: 'context', name: 'a'.repeat(255) },
    { context_id: 'context', name: '  ' },
    { context_id: 'context', name: '☕️'.repeat(255) },
  ])('preserves API description, whitespace and name-limit semantics: %p', async input => {
    facade.updateContext.mockResolvedValue(dto);

    await expect(tool.handler(input, mcpContext)).resolves.toMatchObject({
      structuredContent: output,
    });

    const { context_id, ...properties } = input;
    expect(facade.updateContext).toHaveBeenCalledWith(setupContext, {
      contextId: context_id,
      ...properties,
    });
  });

  it.each([
    { context_id: 'context' },
    { context_id: '', name: 'Marketing' },
    { context_id: 'context', name: '' },
    { context_id: 'context', name: 'a'.repeat(256) },
    { context_id: 'context', name: '☕️'.repeat(256) },
    { context_id: 'context', name: 'Marketing', description: 12 },
  ])('rejects invalid input before calling the facade: %p', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.updateContext).not.toHaveBeenCalled();
  });

  it.each(['project_id', 'user_id', 'roles'])(
    'rejects a caller-supplied %s before calling the facade',
    async field => {
      await expect(
        tool.handler(
          { context_id: 'context', name: 'Marketing', [field]: 'foreign' } as never,
          mcpContext
        )
      ).rejects.toThrow();
      expect(facade.updateContext).not.toHaveBeenCalled();
    }
  );

  it('propagates the facade missing-Context error', async () => {
    const error = new NotFoundException('Context not found in this project');
    facade.updateContext.mockRejectedValue(error);

    await expect(
      tool.handler({ context_id: 'context', name: 'Marketing' }, mcpContext)
    ).rejects.toBe(error);
  });

  it('declares the write scope and update annotations', () => {
    expect(tool.requiredScopes).toEqual(['mcp:write']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });
});
