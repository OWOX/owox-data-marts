import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { DeleteDataMartTool } from './delete-data-mart.tool';

describe('DeleteDataMartTool', () => {
  const facade = { deleteDataMart: jest.fn() };
  const tool = new DeleteDataMartTool(facade as unknown as McpDataMartSetupFacade);

  beforeEach(() => jest.resetAllMocks());

  it('acknowledges deletion of the authenticated target after the domain operation succeeds', async () => {
    const configuration = undefined;
    facade.deleteDataMart.mockResolvedValue(configuration);
    const result = await tool.handler({ data_mart_id: 'mart-1' }, mcpContext);

    expect(facade.deleteDataMart).toHaveBeenCalledWith(setupContext, { dataMartId: 'mart-1' });
    expect(result.structuredContent).toEqual({ data_mart_id: 'mart-1', status: 'deleted' });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
    expect(tool.requiredScopes).toEqual(['mcp:write']);
    expect(tool.annotations.readOnlyHint).toBe(false);
  });

  it.each([
    {},
    { data_mart_id: '' },
    { data_mart_id: 'mart-1', project_id: 'foreign-project' },
    { data_mart_id: 'mart-1', user_id: 'other-user' },
    { data_mart_id: 'mart-1', roles: ['admin'] },
  ])('rejects invalid or untrusted input %j before execution', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.deleteDataMart).not.toHaveBeenCalled();
  });

  it.each([new ForbiddenException(), new NotFoundException()])(
    'propagates domain access and resource failures instead of reporting success',
    async error => {
      facade.deleteDataMart.mockRejectedValue(error);
      await expect(tool.handler({ data_mart_id: 'mart-1' }, mcpContext)).rejects.toBe(error);
    }
  );
});
