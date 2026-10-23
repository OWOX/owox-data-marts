import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import { ContextDto } from '../../../../data-marts/dto/domain/context.dto';
import type { McpContextsFacade } from '../../../../data-marts/facades/mcp-contexts.facade';
import { CreateContextTool } from './create-context.tool';

describe('CreateContextTool', () => {
  const facade = { createContext: jest.fn() };
  const tool = new CreateContextTool(facade as unknown as McpContextsFacade);
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

  it('creates a Context in the connected project and serializes its complete API fields', async () => {
    facade.createContext.mockResolvedValue(dto);

    const result = await tool.handler({ name: 'Marketing', description: null }, mcpContext);

    expect(facade.createContext).toHaveBeenCalledWith(setupContext, {
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
    { name: 'Marketing' },
    { name: 'Marketing', description: null },
    { name: 'Marketing', description: '' },
    { name: 'Marketing', description: '  Goals  ' },
    { name: 'Marketing', description: 'a'.repeat(20_000) },
    { name: 'a'.repeat(255) },
    { name: '  ' },
    { name: '☕️'.repeat(255) },
  ])('preserves API description, whitespace and name-limit semantics: %p', async input => {
    facade.createContext.mockResolvedValue(dto);

    await tool.handler(input, mcpContext);

    expect(facade.createContext).toHaveBeenCalledWith(setupContext, input);
  });

  it('keeps nullable creator fields and ISO dates in Context output', async () => {
    facade.createContext.mockResolvedValue(
      new ContextDto(
        'context',
        'Marketing',
        null,
        'project-1',
        null,
        null,
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-01-02T00:00:00.000Z')
      )
    );

    await expect(tool.handler({ name: 'Marketing' }, mcpContext)).resolves.toMatchObject({
      structuredContent: { ...output, created_by_id: null, created_by_user: null },
    });
  });

  it.each([
    {},
    { name: '' },
    { name: 'a'.repeat(256) },
    { name: '☕️'.repeat(256) },
    { name: 'Marketing', description: 12 },
  ])('rejects invalid input before calling the facade: %p', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.createContext).not.toHaveBeenCalled();
  });

  it.each(['project_id', 'user_id', 'roles'])(
    'rejects a caller-supplied %s before calling the facade',
    async field => {
      await expect(
        tool.handler({ name: 'Marketing', [field]: 'foreign' } as never, mcpContext)
      ).rejects.toThrow();
      expect(facade.createContext).not.toHaveBeenCalled();
    }
  );

  it('propagates the facade authorization error', async () => {
    const error = new ForbiddenException('Admin required');
    facade.createContext.mockRejectedValue(error);

    await expect(tool.handler({ name: 'Marketing' }, mcpContext)).rejects.toBe(error);
  });

  it('declares the write scope and creation annotations', () => {
    expect(tool.requiredScopes).toEqual(['mcp:write']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });
});
