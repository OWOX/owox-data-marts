import { NotFoundException } from '@nestjs/common';
import { z } from 'zod-v4';
import { adminMcpContext, mcpProjectActor } from '../../../../../test/fixtures/mcp-auth-context';
import { ContextDto } from '../../../../data-marts/dto/domain/context.dto';
import type { McpContextsFacade } from '../../../../data-marts/facades/mcp-contexts.facade';
import { UpdateContextMetadataTool } from './update-context-metadata.tool';

describe('UpdateContextMetadataTool', () => {
  const facade = { updateContextMetadata: jest.fn() };
  const tool = new UpdateContextMetadataTool(facade as unknown as McpContextsFacade);
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
    icon: null,
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
    facade.updateContextMetadata.mockResolvedValue(dto);

    const result = await tool.handler(
      { context_id: 'context', name: 'Marketing', description: null },
      adminMcpContext
    );

    expect(facade.updateContextMetadata).toHaveBeenCalledWith(mcpProjectActor, {
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
    { context_id: 'context', description: 'Metadata only' },
    { context_id: 'context', description: null },
    { context_id: 'context', icon: 'purchases' },
    { context_id: 'context', icon: 'lucide:grid-2x2-check' },
    { context_id: 'context', icon: null },
    { context_id: 'context', name: 'Marketing', description: 'Goals', icon: 'purchases' },
    { context_id: 'context', name: 'Marketing' },
    { context_id: 'context', name: 'Marketing', description: null },
    { context_id: 'context', name: 'Marketing', description: '' },
    { context_id: 'context', name: 'Marketing', description: '  Goals  ' },
    { context_id: 'context', name: 'a'.repeat(255) },
    { context_id: 'context', name: '  ' },
    { context_id: 'context', name: '☕️'.repeat(255) },
  ])('preserves API description, whitespace and name-limit semantics: %p', async input => {
    facade.updateContextMetadata.mockResolvedValue(dto);

    await expect(tool.handler(tool.parseInput(input), adminMcpContext)).resolves.toMatchObject({
      structuredContent: output,
    });

    const { context_id, ...properties } = input;
    expect(facade.updateContextMetadata).toHaveBeenCalledWith(mcpProjectActor, {
      contextId: context_id,
      ...properties,
    });
  });

  it.each([
    { context_id: 'context' },
    { context_id: '', name: 'Marketing' },
    { context_id: 'context', name: '' },
    { context_id: 'context', name: null },
    { context_id: 'context', name: 'a'.repeat(256) },
    { context_id: 'context', name: '☕️'.repeat(256) },
    { context_id: 'context', name: 'Marketing', description: 12 },
    { context_id: 'context', icon: 'unknown' },
    { context_id: 'context', icon: 'lucide:' },
    { context_id: 'context', icon: `lucide:${'a'.repeat(60)}` },
    { context_id: 'context', icon: 42 },
  ])('rejects invalid input before calling the facade: %p', async input => {
    await expect(tool.handler(input as never, adminMcpContext)).rejects.toThrow(z.ZodError);
    expect(facade.updateContextMetadata).not.toHaveBeenCalled();
  });

  it.each(['project_id', 'user_id', 'roles'])(
    'rejects a caller-supplied %s on direct handler calls',
    async field => {
      await expect(
        tool.handler(
          { context_id: 'context', name: 'Marketing', [field]: 'foreign' } as never,
          adminMcpContext
        )
      ).rejects.toThrow(z.ZodError);
      expect(facade.updateContextMetadata).not.toHaveBeenCalled();
    }
  );

  it('propagates the facade missing-Context error', async () => {
    const error = new NotFoundException('Context not found in this project');
    facade.updateContextMetadata.mockRejectedValue(error);

    await expect(
      tool.handler({ context_id: 'context', name: 'Marketing' }, adminMcpContext)
    ).rejects.toBe(error);
  });

  it('returns the saved icon in the advertised metadata output', async () => {
    facade.updateContextMetadata.mockResolvedValue({ ...dto, icon: 'lucide:megaphone' });
    const result = await tool.handler(
      { context_id: 'context', icon: 'lucide:megaphone' },
      adminMcpContext
    );
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual({
      ...output,
      icon: 'lucide:megaphone',
    });
  });

  it('declares the write scope and update annotations', () => {
    expect(tool.requiredScopes).toEqual(['mcp:write']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });
});
