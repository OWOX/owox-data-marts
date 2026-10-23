import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { UpdateDataMartAvailabilityTool } from './update-data-mart-availability.tool';

describe('UpdateDataMartAvailabilityTool', () => {
  const facade = { updateDataMartAvailability: jest.fn() };
  const tool = new UpdateDataMartAvailabilityTool(facade as unknown as McpDataMartSetupFacade);

  beforeEach(() => jest.resetAllMocks());

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    'preserves reporting=%s and maintenance=%s with the authenticated actor',
    async (reporting, maintenance) => {
      const result = await tool.handler(
        {
          data_mart_id: 'mart-1',
          available_for_reporting: reporting,
          available_for_maintenance: maintenance,
        },
        mcpContext
      );
      expect(facade.updateDataMartAvailability).toHaveBeenCalledWith(setupContext, {
        dataMartId: 'mart-1',
        availableForReporting: reporting,
        availableForMaintenance: maintenance,
      });
      expect(result.structuredContent).toEqual({ data_mart_id: 'mart-1', status: 'updated' });
      expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
        result.structuredContent
      );
      expect(tool.requiredScopes).toEqual(['mcp:write']);
    }
  );

  it.each([
    { data_mart_id: 'mart-1', available_for_reporting: false },
    { data_mart_id: 'mart-1', available_for_maintenance: false },
    { data_mart_id: 'mart-1', available_for_reporting: 'false', available_for_maintenance: false },
    { data_mart_id: '', available_for_reporting: false, available_for_maintenance: false },
    {
      data_mart_id: 'mart-1',
      available_for_reporting: false,
      available_for_maintenance: false,
      project_id: 'foreign',
    },
    {
      data_mart_id: 'mart-1',
      available_for_reporting: false,
      available_for_maintenance: false,
      user_id: 'other',
    },
    {
      data_mart_id: 'mart-1',
      available_for_reporting: false,
      available_for_maintenance: false,
      roles: ['admin'],
    },
  ])('rejects incomplete or untrusted sharing updates %j', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.updateDataMartAvailability).not.toHaveBeenCalled();
  });

  it('does not acknowledge a rejected sharing change', async () => {
    const error = new ForbiddenException('Sharing denied');
    facade.updateDataMartAvailability.mockRejectedValue(error);
    await expect(
      tool.handler(
        {
          data_mart_id: 'mart-1',
          available_for_reporting: false,
          available_for_maintenance: false,
        },
        mcpContext
      )
    ).rejects.toBe(error);
  });
});
