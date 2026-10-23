import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod-v4';
import {
  dataMartConfiguration,
  mcpContext,
  setupContext,
} from '../../../../../test/fixtures/mcp-configuration';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { PublishDataMartTool } from './publish-data-mart.tool';

describe('PublishDataMartTool', () => {
  const facade = { publishDataMart: jest.fn() };
  const tool = new PublishDataMartTool(facade as unknown as McpDataMartSetupFacade);

  beforeEach(() => jest.resetAllMocks());

  it('publishes the authenticated target and returns its resulting configuration', async () => {
    const configuration = { ...dataMartConfiguration, status: 'PUBLISHED' };
    facade.publishDataMart.mockResolvedValue(configuration);
    const result = await tool.handler({ data_mart_id: 'mart-1' }, mcpContext);

    expect(facade.publishDataMart).toHaveBeenCalledWith(setupContext, { dataMartId: 'mart-1' });
    expect(result.structuredContent).toEqual({ data_mart: configuration });
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
    expect(facade.publishDataMart).not.toHaveBeenCalled();
  });

  it.each([new ForbiddenException(), new NotFoundException()])(
    'propagates domain access and resource failures instead of reporting success',
    async error => {
      facade.publishDataMart.mockRejectedValue(error);
      await expect(tool.handler({ data_mart_id: 'mart-1' }, mcpContext)).rejects.toBe(error);
    }
  );
});
