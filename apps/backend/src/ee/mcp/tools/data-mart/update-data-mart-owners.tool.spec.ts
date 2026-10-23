import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import {
  dataMartConfiguration,
  mcpContext,
  setupContext,
} from '../../../../../test/fixtures/mcp-configuration';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { UpdateDataMartOwnersTool } from './update-data-mart-owners.tool';

describe('UpdateDataMartOwnersTool', () => {
  const facade = { updateDataMartOwners: jest.fn() };
  const tool = new UpdateDataMartOwnersTool(facade as unknown as McpDataMartSetupFacade);

  beforeEach(() => jest.resetAllMocks());

  it.each([
    { business: ['business-1'], technical: ['technical-1'] },
    { business: [], technical: [] },
  ])(
    'replaces both owner lists and returns the mutation result without rereading: %j',
    async ({ business, technical }) => {
      const configuration = {
        ...dataMartConfiguration,
        businessOwnerIds: business,
        technicalOwnerIds: technical,
      };
      facade.updateDataMartOwners.mockResolvedValue(configuration);
      const result = await tool.handler(
        {
          data_mart_id: 'mart-1',
          business_owner_ids: business,
          technical_owner_ids: technical,
        },
        mcpContext
      );
      expect(facade.updateDataMartOwners).toHaveBeenCalledWith(setupContext, {
        dataMartId: 'mart-1',
        businessOwnerIds: business,
        technicalOwnerIds: technical,
      });
      expect(result.structuredContent).toEqual({ data_mart: configuration });
      expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
        result.structuredContent
      );
      expect(tool.requiredScopes).toEqual(['mcp:write']);
    }
  );

  it.each([
    ['missing business list', { technical_owner_ids: [] }],
    ['missing technical list', { business_owner_ids: [] }],
    ['empty business ID', { business_owner_ids: [''], technical_owner_ids: [] }],
    ['empty technical ID', { business_owner_ids: [], technical_owner_ids: [''] }],
    [
      'too many business owners',
      { business_owner_ids: Array(101).fill('member'), technical_owner_ids: [] },
    ],
    [
      'too many technical owners',
      { business_owner_ids: [], technical_owner_ids: Array(101).fill('member') },
    ],
    [
      'project override',
      { business_owner_ids: [], technical_owner_ids: [], project_id: 'foreign' },
    ],
    ['actor override', { business_owner_ids: [], technical_owner_ids: [], user_id: 'other' }],
    ['role override', { business_owner_ids: [], technical_owner_ids: [], roles: ['admin'] }],
  ] as const)('rejects %s before changing ownership', async (_name, properties) => {
    await expect(
      tool.handler({ data_mart_id: 'mart-1', ...properties } as never, mcpContext)
    ).rejects.toThrow();
    expect(facade.updateDataMartOwners).not.toHaveBeenCalled();
  });

  it('accepts the maximum owner list lengths', () => {
    expect(() =>
      tool.parseInput({
        data_mart_id: 'mart-1',
        business_owner_ids: Array(100).fill('business'),
        technical_owner_ids: Array(100).fill('technical'),
      })
    ).not.toThrow();
  });

  it('propagates the owner-management permission denial', async () => {
    const error = new ForbiddenException('Managing owners denied');
    facade.updateDataMartOwners.mockRejectedValue(error);
    await expect(
      tool.handler(
        {
          data_mart_id: 'mart-1',
          business_owner_ids: [],
          technical_owner_ids: [],
        },
        mcpContext
      )
    ).rejects.toBe(error);
  });
});
