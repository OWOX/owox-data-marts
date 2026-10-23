import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import {
  dataMartConfiguration,
  mcpContext,
  setupContext,
} from '../../../../../test/fixtures/mcp-configuration';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { UpdateDataMartSchemaTool } from './update-data-mart-schema.tool';

describe('UpdateDataMartSchemaTool', () => {
  const facade = { updateDataMartSchema: jest.fn() };
  const tool = new UpdateDataMartSchemaTool(facade as unknown as McpDataMartSetupFacade);
  const schema = {
    type: 'bigquery-data-mart-schema',
    fields: [
      {
        name: 'profit',
        type: 'FLOAT',
        mode: 'NULLABLE',
        calculated: { formula: 'SUM({{ref field="amount"}})' },
        futureMetadata: { keep: true },
      },
    ],
  };

  beforeEach(() => jest.resetAllMocks());

  it('preserves schema metadata and returns non-blocking warnings outside the Data Mart', async () => {
    const warnings = [{ code: 'WAREHOUSE_CHECK_SKIPPED', message: 'Not checked', field: 'profit' }];
    const configuration = { ...dataMartConfiguration, schema };
    facade.updateDataMartSchema.mockResolvedValue({ ...configuration, warnings });
    const result = await tool.handler({ data_mart_id: 'mart-1', schema } as never, mcpContext);
    expect(facade.updateDataMartSchema).toHaveBeenCalledWith(setupContext, {
      dataMartId: 'mart-1',
      schema,
    });
    expect(result.structuredContent).toEqual({ data_mart: configuration, warnings });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
    expect(tool.requiredScopes).toEqual(['mcp:write']);
  });

  it.each([
    { data_mart_id: 'mart-1', schema: {} },
    {
      data_mart_id: 'mart-1',
      schema: { type: 'bigquery-data-mart-schema', fields: [{ name: 'x', type: 'STRING' }] },
    },
    { data_mart_id: 'mart-1', schema, project_id: 'foreign' },
    { data_mart_id: 'mart-1', schema, user_id: 'other' },
    { data_mart_id: 'mart-1', schema, roles: ['admin'] },
  ])('rejects invalid schema or untrusted context %j before saving', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.updateDataMartSchema).not.toHaveBeenCalled();
  });

  it('propagates resource access failures', async () => {
    const error = new ForbiddenException('Edit denied');
    facade.updateDataMartSchema.mockRejectedValue(error);
    await expect(
      tool.handler({ data_mart_id: 'mart-1', schema } as never, mcpContext)
    ).rejects.toBe(error);
  });
});
