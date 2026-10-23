import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { PublicOriginService } from '../../../../common/config/public-origin.service';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { CreateDataMartTool } from './create-data-mart.tool';

describe('CreateDataMartTool', () => {
  const facade = { createDataMart: jest.fn() };
  const publicOrigin = {
    getPublicOrigin: jest.fn(),
  } as unknown as jest.Mocked<PublicOriginService>;
  const tool = new CreateDataMartTool(facade as unknown as McpDataMartSetupFacade, publicOrigin);

  beforeEach(() => {
    jest.resetAllMocks();
    publicOrigin.getPublicOrigin.mockReturnValue('https://app.owox.com');
  });

  it.each([{}, { icon: null }, { icon: 'purchases' }])(
    'creates with the trusted project and actor, preserving optional icon %j',
    async properties => {
      facade.createDataMart.mockResolvedValue({ id: 'mart-1', title: 'Revenue' });
      const result = await tool.handler(
        { title: 'Revenue', storage_id: 'storage-1', ...properties } as never,
        mcpContext
      );
      expect(facade.createDataMart).toHaveBeenCalledWith(setupContext, {
        title: 'Revenue',
        storageId: 'storage-1',
        ...properties,
      });
      expect(result.structuredContent).toEqual({
        data_mart: { id: 'mart-1', title: 'Revenue' },
        setup_url: 'https://app.owox.com/ui/project-1/data-marts/mart-1/data-setup',
        next_steps: expect.arrayContaining([
          expect.stringContaining('update_data_mart_definition'),
          expect.stringContaining('get_data_mart_configuration'),
          expect.stringContaining('validate_data_mart_definition'),
        ]),
      });
      expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
        result.structuredContent
      );
      expect(tool.requiredScopes).toEqual(['mcp:write']);
    }
  );

  it('uses connector_name only to preselect the connector in the returned setup URL', async () => {
    facade.createDataMart.mockResolvedValue({ id: 'mart-1', title: 'Revenue' });

    const result = await tool.handler(
      { title: 'Revenue', storage_id: 'storage-1', connector_name: 'GoogleSheets' },
      mcpContext
    );

    expect(facade.createDataMart).toHaveBeenCalledWith(setupContext, {
      title: 'Revenue',
      storageId: 'storage-1',
    });
    const expected = {
      data_mart: { id: 'mart-1', title: 'Revenue' },
      setup_url:
        'https://app.owox.com/ui/project-1/data-marts/mart-1/data-setup?preset=connector&connectorName=GoogleSheets',
      next_steps: expect.arrayContaining([
        expect.stringMatching(/Open setup_url.*authenticate.*picker.*save/i),
        expect.stringMatching(
          /confirm.*get_data_mart_configuration.*list_connector_configurations/
        ),
        expect.stringContaining('validate_data_mart_definition'),
      ]),
    };
    expect(result.structuredContent).toEqual(expected);
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(result.structuredContent, null, 2) },
    ]);
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
  });

  it('encodes project, created draft and connector query values using the configured public origin', async () => {
    publicOrigin.getPublicOrigin.mockReturnValue('https://selfhost.example.test/');
    facade.createDataMart.mockResolvedValue({ id: 'draft/with space?tab=other', title: 'Revenue' });

    const result = await tool.handler(
      {
        title: 'Revenue',
        storage_id: 'storage-1',
        connector_name: 'GoogleSheets/Accounts & Orders?x=1',
      },
      { ...mcpContext, projectId: 'project/with space' }
    );

    expect(result.structuredContent).toMatchObject({
      data_mart: { id: 'draft/with space?tab=other', title: 'Revenue' },
      setup_url:
        'https://selfhost.example.test/ui/project%2Fwith%20space/data-marts/draft%2Fwith%20space%3Ftab%3Dother/data-setup?preset=connector&connectorName=GoogleSheets%2FAccounts%20%26%20Orders%3Fx%3D1',
    });
    expect(facade.createDataMart).toHaveBeenCalledWith(
      { ...setupContext, projectId: 'project/with space' },
      { title: 'Revenue', storageId: 'storage-1' }
    );
  });

  it.each([
    { title: '', storage_id: 'storage-1' },
    { title: 'Revenue', storage_id: '' },
    { title: 'Revenue' },
    { title: 'Revenue', storage_id: 'storage-1', icon: 'invalid-icon' },
    { title: 'Revenue', storage_id: 'storage-1', connector_name: '' },
    { title: 'Revenue', storage_id: 'storage-1', connector_name: '   ' },
    { title: 'Revenue', storage_id: 'storage-1', connector_name: 1 },
    { title: 'Revenue', storage_id: 'storage-1', project_id: 'foreign' },
    { title: 'Revenue', storage_id: 'storage-1', user_id: 'other' },
    { title: 'Revenue', storage_id: 'storage-1', roles: ['admin'] },
  ])('rejects invalid or untrusted creation input %j before execution', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.createDataMart).not.toHaveBeenCalled();
    expect(publicOrigin.getPublicOrigin).not.toHaveBeenCalled();
  });

  it('propagates storage-use permission failures', async () => {
    const error = new ForbiddenException('Cannot use storage');
    facade.createDataMart.mockRejectedValue(error);
    await expect(
      tool.handler({ title: 'Revenue', storage_id: 'storage-1' }, mcpContext)
    ).rejects.toBe(error);
    expect(publicOrigin.getPublicOrigin).not.toHaveBeenCalled();
  });

  it('advertises optional connector preselection and a required setup URL in serializable schemas', () => {
    const inputJson = z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' });
    const outputJson = z.toJSONSchema(z.object(tool.outputSchema));

    expect(inputJson.properties).toHaveProperty('connector_name');
    expect(inputJson.required).toEqual(['title', 'storage_id']);
    expect(outputJson.properties).toHaveProperty(
      'setup_url',
      expect.objectContaining({ type: 'string' })
    );
    expect(outputJson.properties).toHaveProperty(
      'next_steps',
      expect.objectContaining({ type: 'array' })
    );
    expect(outputJson.required).toEqual(['data_mart', 'setup_url', 'next_steps']);
  });
});
