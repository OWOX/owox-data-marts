import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { UpdateDataMartContextsTool } from './update-data-mart-contexts.tool';

describe('UpdateDataMartContextsTool', () => {
  const facade = { updateDataMartContexts: jest.fn() };
  const tool = new UpdateDataMartContextsTool(facade as unknown as McpDataMartSetupFacade);

  beforeEach(() => jest.resetAllMocks());

  it.each([{ ids: [] }, { ids: ['context-1', 'context-2'] }])(
    'replaces the complete assignment list without rereading the mart: %j',
    async ({ ids }) => {
      const result = await tool.handler({ data_mart_id: 'mart-1', context_ids: ids }, mcpContext);
      expect(facade.updateDataMartContexts).toHaveBeenCalledWith(setupContext, {
        dataMartId: 'mart-1',
        contextIds: ids,
      });
      expect(result.structuredContent).toEqual({ data_mart_id: 'mart-1', status: 'updated' });
      expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
        result.structuredContent
      );
      expect(tool.requiredScopes).toEqual(['mcp:write']);
    }
  );

  it.each([
    ['missing assignment list', { data_mart_id: 'mart-1' }],
    ['empty target', { data_mart_id: '', context_ids: [] }],
    ['empty Context ID', { data_mart_id: 'mart-1', context_ids: [''] }],
    [
      'overlong assignment list',
      { data_mart_id: 'mart-1', context_ids: Array(101).fill('context') },
    ],
    ['project override', { data_mart_id: 'mart-1', context_ids: [], project_id: 'foreign' }],
    ['actor override', { data_mart_id: 'mart-1', context_ids: [], user_id: 'other' }],
    ['role override', { data_mart_id: 'mart-1', context_ids: [], roles: ['admin'] }],
  ] as const)('rejects %s before changing assignments', async (_name, input) => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.updateDataMartContexts).not.toHaveBeenCalled();
  });

  it('accepts the maximum Context assignment count', () => {
    expect(
      tool.parseInput({ data_mart_id: 'mart-1', context_ids: Array(100).fill('context') })
        .context_ids
    ).toHaveLength(100);
  });

  it('does not acknowledge a rejected assignment update', async () => {
    const error = new ForbiddenException('Technical ownership required');
    facade.updateDataMartContexts.mockRejectedValue(error);
    await expect(
      tool.handler({ data_mart_id: 'mart-1', context_ids: [] }, mcpContext)
    ).rejects.toBe(error);
  });
});
