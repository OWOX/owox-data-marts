import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod-v4';
import {
  dataMartConfiguration,
  mcpContext,
  setupContext,
} from '../../../../../test/fixtures/mcp-configuration';
import type { PublicOriginService } from '../../../../common/config/public-origin.service';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { GetDataMartConfigurationTool } from './get-data-mart-configuration.tool';

describe('GetDataMartConfigurationTool', () => {
  const facade = { getDataMart: jest.fn() };
  const publicOrigin = {
    getPublicOrigin: jest.fn(),
  } as unknown as jest.Mocked<PublicOriginService>;
  const tool = new GetDataMartConfigurationTool(
    facade as unknown as McpDataMartSetupFacade,
    publicOrigin
  );

  beforeEach(() => {
    jest.resetAllMocks();
    publicOrigin.getPublicOrigin.mockReturnValue('https://app.owox.com');
  });

  it('reads the saved configuration in the authenticated project', async () => {
    const configuration = dataMartConfiguration;
    facade.getDataMart.mockResolvedValue(configuration);
    const result = await tool.handler({ data_mart_id: 'mart-1' }, mcpContext);

    expect(facade.getDataMart).toHaveBeenCalledWith(setupContext, { dataMartId: 'mart-1' });
    const expected = {
      data_mart: configuration,
      setup_url: 'https://app.owox.com/ui/project-1/data-marts/mart-1/data-setup',
      next_steps: expect.arrayContaining([
        expect.stringContaining('No source definition has been saved'),
        expect.stringContaining('confirm'),
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
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations.readOnlyHint).toBe(true);
  });

  it('links the authorized saved resource in the connected project without inventing setup state', async () => {
    publicOrigin.getPublicOrigin.mockReturnValue('https://selfhost.example.test/');
    const configuration = { ...dataMartConfiguration, id: 'draft/with space?tab=other' };
    facade.getDataMart.mockResolvedValue(configuration);

    const result = await tool.handler(
      { data_mart_id: 'draft/with space?tab=other' },
      { ...mcpContext, projectId: 'project/with space' }
    );

    expect(facade.getDataMart).toHaveBeenCalledWith(
      { ...setupContext, projectId: 'project/with space' },
      { dataMartId: 'draft/with space?tab=other' }
    );
    expect(result.structuredContent).toMatchObject({
      data_mart: configuration,
      setup_url:
        'https://selfhost.example.test/ui/project%2Fwith%20space/data-marts/draft%2Fwith%20space%3Ftab%3Dother/data-setup',
    });
    expect(configuration.definition).toBeNull();
  });

  it('guides connector setup through saved configuration inspection and validation without assuming authentication works', async () => {
    const configuration = {
      ...dataMartConfiguration,
      definitionType: 'CONNECTOR',
      definition: {
        connector: {
          source: { name: 'GoogleSheets', configuration: [{}], node: 'sheet', fields: ['id'] },
          storage: { fullyQualifiedName: 'project.dataset.orders' },
        },
      },
    };
    facade.getDataMart.mockResolvedValue(configuration);

    const result = await tool.handler({ data_mart_id: 'mart-1' }, mcpContext);

    expect(result.structuredContent).toEqual({
      data_mart: configuration,
      setup_url: 'https://app.owox.com/ui/project-1/data-marts/mart-1/data-setup',
      next_steps: expect.arrayContaining([
        expect.stringMatching(/saved.*does not establish.*authentication/i),
        expect.stringContaining('list_connector_configurations'),
        expect.stringMatching(
          /confirm.*get_data_mart_configuration.*list_connector_configurations/
        ),
        expect.stringContaining('validate_data_mart_definition'),
      ]),
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
  });

  it('keeps a saved warehouse definition on the normal validation workflow', async () => {
    facade.getDataMart.mockResolvedValue({
      ...dataMartConfiguration,
      definitionType: 'SQL',
      definition: { sqlQuery: 'SELECT 1' },
    });

    const result = await tool.handler({ data_mart_id: 'mart-1' }, mcpContext);

    const { next_steps: steps } = z
      .object({ next_steps: z.array(z.string()) })
      .parse(result.structuredContent);
    expect(steps.join(' ')).toContain('validate_data_mart_definition');
    expect(steps.join(' ')).not.toContain('list_connector_configurations');
    expect(steps.join(' ')).not.toContain('picker');
  });

  it.each([
    {},
    { data_mart_id: '' },
    { data_mart_id: 'mart-1', project_id: 'foreign-project' },
    { data_mart_id: 'mart-1', user_id: 'other-user' },
    { data_mart_id: 'mart-1', roles: ['admin'] },
    { data_mart_id: 'mart-1', connector_name: 'GoogleSheets' },
  ])('rejects invalid or untrusted input %j before execution', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.getDataMart).not.toHaveBeenCalled();
    expect(publicOrigin.getPublicOrigin).not.toHaveBeenCalled();
  });

  it.each([new ForbiddenException(), new NotFoundException()])(
    'propagates domain access and resource failures instead of reporting success',
    async error => {
      facade.getDataMart.mockRejectedValue(error);
      await expect(tool.handler({ data_mart_id: 'mart-1' }, mcpContext)).rejects.toBe(error);
      expect(publicOrigin.getPublicOrigin).not.toHaveBeenCalled();
    }
  );

  it('advertises an explicit required setup URL without changing configuration inputs', () => {
    const inputJson = z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' });
    const outputJson = z.toJSONSchema(z.object(tool.outputSchema));

    expect(Object.keys(inputJson.properties!)).toEqual(['data_mart_id']);
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
