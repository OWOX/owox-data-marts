import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpConnectorsFacade } from '../../../../data-marts/facades/mcp-connectors.facade';
import { sourceDataMartId } from './connector-tool.fixtures';
import { PreviewConnectorFieldOptionsTool } from './preview-connector-field-options.tool';

describe('PreviewConnectorFieldOptionsTool', () => {
  const facade = { previewConnectorFieldOptions: jest.fn() };
  const tool = new PreviewConnectorFieldOptionsTool(facade as unknown as McpConnectorsFacade);

  beforeEach(() => jest.resetAllMocks());

  it('forwards the field, dependencies and public source pair with trusted context', async () => {
    const options = [{ value: 'account-1', label: 'Основний рахунок' }];
    facade.previewConnectorFieldOptions.mockResolvedValue(options);
    const result = await tool.handler(
      {
        connector_name: 'CustomOrders',
        field: 'AccountId',
        configuration: { Region: 'EU' },
        source_data_mart_id: sourceDataMartId,
        source_configuration_id: 'configuration-1',
      },
      mcpContext
    );

    expect(facade.previewConnectorFieldOptions).toHaveBeenCalledWith(setupContext, {
      connectorName: 'CustomOrders',
      field: 'AccountId',
      configuration: { Region: 'EU' },
      sourceDataMartId,
      sourceConfigurationId: 'configuration-1',
    });
    expect(result).toEqual({
      structuredContent: expect.objectContaining({ options }),
      content: [{ type: 'text', text: JSON.stringify(result.structuredContent, null, 2) }],
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toMatchObject({ options });
  });

  it('permits options without overrides or a reusable source', async () => {
    facade.previewConnectorFieldOptions.mockResolvedValue([]);
    const result = await tool.handler({ connector_name: 'Stripe', field: 'AccountId' }, mcpContext);
    expect(result.structuredContent).toMatchObject({ options: [] });
    expect(facade.previewConnectorFieldOptions).toHaveBeenCalledWith(setupContext, {
      connectorName: 'Stripe',
      field: 'AccountId',
    });
  });

  it('permits selecting a reusable source without configuration overrides', async () => {
    facade.previewConnectorFieldOptions.mockResolvedValue([]);
    await tool.handler(
      {
        connector_name: 'Stripe',
        field: 'AccountId',
        source_data_mart_id: sourceDataMartId,
        source_configuration_id: 'configuration-1',
      },
      mcpContext
    );
    expect(facade.previewConnectorFieldOptions).toHaveBeenCalledWith(setupContext, {
      connectorName: 'Stripe',
      field: 'AccountId',
      sourceDataMartId,
      sourceConfigurationId: 'configuration-1',
    });
  });

  it.each([
    {},
    { connector_name: 'Stripe' },
    { connector_name: '', field: 'AccountId' },
    { connector_name: 'Stripe', field: '' },
    { connector_name: 'Stripe', field: '   ' },
    { connector_name: 'Stripe', field: 'AccountId', configuration: null },
    { connector_name: 'Stripe', field: 'AccountId', configuration: [] },
    { connector_name: 'Stripe', field: 'AccountId', source_data_mart_id: sourceDataMartId },
    { connector_name: 'Stripe', field: 'AccountId', source_configuration_id: 'configuration-1' },
    {
      connector_name: 'Stripe',
      field: 'AccountId',
      source_data_mart_id: 'not-a-uuid',
      source_configuration_id: 'configuration-1',
    },
    {
      connector_name: 'Stripe',
      field: 'AccountId',
      source_data_mart_id: sourceDataMartId,
      source_configuration_id: '',
    },
    { connector_name: 'Stripe', field: 'AccountId', version: 3 },
    { connector_name: 'Stripe', field: 'AccountId', user_id: 'other' },
    { connector_name: 'Stripe', field: 'AccountId', roles: ['admin'] },
  ])('rejects invalid field-option input %j before calling the connector', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.previewConnectorFieldOptions).not.toHaveBeenCalled();
  });

  it.each([
    new ForbiddenException('Cannot edit the source Data Mart'),
    new BadRequestException('Dynamic options are not supported for this field'),
  ])('propagates access and connector support errors: %s', async error => {
    facade.previewConnectorFieldOptions.mockRejectedValueOnce(error);
    await expect(
      tool.handler({ connector_name: 'Stripe', field: 'AccountId' }, mcpContext)
    ).rejects.toBe(error);
  });

  it('advertises explicit serializable option schemas and external read access', () => {
    expect(z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' }).properties).toHaveProperty(
      'field'
    );
    expect(z.toJSONSchema(z.object(tool.outputSchema)).properties).toHaveProperty('options');
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    });
  });
});
