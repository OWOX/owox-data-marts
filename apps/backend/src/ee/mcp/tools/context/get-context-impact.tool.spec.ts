import { NotFoundException } from '@nestjs/common';
import { z } from 'zod-v4';
import { adminMcpContext, mcpProjectActor } from '../../../../../test/fixtures/mcp-auth-context';
import { ContextImpactDto } from '../../../../data-marts/dto/domain/context.dto';
import type { McpContextsFacade } from '../../../../data-marts/facades/mcp-contexts.facade';
import { GetContextImpactTool } from './get-context-impact.tool';

describe('GetContextImpactTool', () => {
  const facade = { getContextImpact: jest.fn() };
  const tool = new GetContextImpactTool(facade as unknown as McpContextsFacade);

  beforeEach(() => jest.resetAllMocks());

  it('returns every Context impact field with snake_case keys for the connected project', async () => {
    facade.getContextImpact.mockResolvedValue(
      new ContextImpactDto('context', 'Marketing', 1, 2, 3, 4, 5, ['member'])
    );
    const output = {
      context_id: 'context',
      context_name: 'Marketing',
      data_mart_count: 1,
      storage_count: 2,
      destination_count: 3,
      member_count: 4,
      user_provisioning_defaults_count: 5,
      affected_member_ids: ['member'],
    };

    const result = await tool.handler({ context_id: 'context' }, adminMcpContext);

    expect(facade.getContextImpact).toHaveBeenCalledWith(mcpProjectActor, { contextId: 'context' });
    expect(result).toEqual({
      structuredContent: output,
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(output);
  });

  it.each([{}, { context_id: '' }, { context_id: 1 }])(
    'rejects invalid input before calling the facade: %p',
    async input => {
      await expect(tool.handler(input as never, adminMcpContext)).rejects.toThrow(z.ZodError);
      expect(facade.getContextImpact).not.toHaveBeenCalled();
    }
  );

  it.each(['project_id', 'user_id', 'roles'])(
    'rejects a caller-supplied %s on direct handler calls',
    async field => {
      await expect(
        tool.handler({ context_id: 'context', [field]: 'foreign' } as never, adminMcpContext)
      ).rejects.toThrow(z.ZodError);
      expect(facade.getContextImpact).not.toHaveBeenCalled();
    }
  );

  it('propagates the facade missing-Context error', async () => {
    const error = new NotFoundException('Context not found in this project');
    facade.getContextImpact.mockRejectedValue(error);

    await expect(tool.handler({ context_id: 'context' }, adminMcpContext)).rejects.toBe(error);
  });

  it('declares the read scope and impact annotations', () => {
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  });
});
