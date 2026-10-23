import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import {
  dataMartConfiguration,
  mcpContext,
  setupContext,
} from '../../../../../test/fixtures/mcp-configuration';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { UpdateDataMartBlendedFieldsConfigTool } from './update-data-mart-blended-fields-config.tool';

describe('UpdateDataMartBlendedFieldsConfigTool', () => {
  const facade = { updateDataMartBlendedFieldsConfig: jest.fn() };
  const tool = new UpdateDataMartBlendedFieldsConfigTool(
    facade as unknown as McpDataMartSetupFacade
  );

  beforeEach(() => jest.resetAllMocks());

  it('forwards nested API settings, preserves false flags and normalizes the join description', async () => {
    const fields = {
      amount: {
        alias: 'Amount',
        isHidden: false,
        aggregateFunction: 'SUM',
        postJoinAggregations: ['SUM'],
      },
    };
    const configuration = {
      sources: [
        {
          path: 'orders.items',
          alias: 'Items',
          isExcluded: false,
          description: 'Item details',
          fields,
        },
      ],
    };
    const saved = { ...dataMartConfiguration, blendedFieldsConfig: configuration };
    facade.updateDataMartBlendedFieldsConfig.mockResolvedValue(saved);
    const result = await tool.handler(
      {
        data_mart_id: 'mart-1',
        blended_fields_config: {
          sources: [{ ...configuration.sources[0], description: '  Item details  ' }],
        },
      } as never,
      mcpContext
    );
    expect(facade.updateDataMartBlendedFieldsConfig).toHaveBeenCalledWith(setupContext, {
      dataMartId: 'mart-1',
      blendedFieldsConfig: configuration,
    });
    expect(result.structuredContent).toEqual({ data_mart: saved });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
    expect(tool.requiredScopes).toEqual(['mcp:write']);
  });

  it('passes an explicit null through to clear overrides', async () => {
    facade.updateDataMartBlendedFieldsConfig.mockResolvedValue(dataMartConfiguration);
    await tool.handler({ data_mart_id: 'mart-1', blended_fields_config: null }, mcpContext);
    expect(facade.updateDataMartBlendedFieldsConfig).toHaveBeenCalledWith(setupContext, {
      dataMartId: 'mart-1',
      blendedFieldsConfig: null,
    });
  });

  it.each([
    { data_mart_id: 'mart-1' },
    { data_mart_id: 'mart-1', blended_fields_config: {} },
    {
      data_mart_id: 'mart-1',
      blended_fields_config: { sources: [{ path: 'Orders', alias: 'Orders' }] },
    },
    {
      data_mart_id: 'mart-1',
      blended_fields_config: { sources: [{ path: 'orders', alias: 'Orders', description: '  ' }] },
    },
    {
      data_mart_id: 'mart-1',
      blended_fields_config: {
        sources: [
          { path: 'orders', alias: 'Orders', fields: { amount: { aggregateFunction: 'INVALID' } } },
        ],
      },
    },
    { data_mart_id: 'mart-1', blended_fields_config: null, project_id: 'foreign' },
    { data_mart_id: 'mart-1', blended_fields_config: null, user_id: 'other' },
    { data_mart_id: 'mart-1', blended_fields_config: null, roles: ['admin'] },
  ])('rejects invalid or untrusted replacement %j before saving', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.updateDataMartBlendedFieldsConfig).not.toHaveBeenCalled();
  });

  it('propagates edit failures instead of returning configuration', async () => {
    const error = new ForbiddenException('Edit denied');
    facade.updateDataMartBlendedFieldsConfig.mockRejectedValue(error);
    await expect(
      tool.handler({ data_mart_id: 'mart-1', blended_fields_config: null }, mcpContext)
    ).rejects.toBe(error);
  });
});
