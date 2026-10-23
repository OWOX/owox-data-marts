import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { ValidateDataMartDefinitionTool } from './validate-data-mart-definition.tool';

describe('ValidateDataMartDefinitionTool', () => {
  const facade = { validateDataMartDefinition: jest.fn() };
  const tool = new ValidateDataMartDefinitionTool(facade as unknown as McpDataMartSetupFacade);

  beforeEach(() => jest.resetAllMocks());

  it('returns successful validation without inventing absent diagnostics', async () => {
    facade.validateDataMartDefinition.mockResolvedValue({ valid: true });
    const result = await tool.handler({ data_mart_id: 'mart-1' }, mcpContext);
    expect(facade.validateDataMartDefinition).toHaveBeenCalledWith(setupContext, {
      dataMartId: 'mart-1',
    });
    expect(result.structuredContent).toEqual({ valid: true });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual({ valid: true });
    expect(tool.requiredScopes).toEqual(['mcp:read']);
  });

  it('maps unsuccessful warehouse validation into the advertised diagnostics', async () => {
    facade.validateDataMartDefinition.mockResolvedValue({
      valid: false,
      errorMessage: 'Unknown column',
      details: { line: 2 },
      reason: { code: 'INVALID_QUERY' },
    });
    const result = await tool.handler({ data_mart_id: 'mart-1' }, mcpContext);
    expect(result.structuredContent).toEqual({
      valid: false,
      error_message: 'Unknown column',
      details: { line: 2 },
      reason: { code: 'INVALID_QUERY' },
    });
    expect(result.isError).not.toBe(true);
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
  });

  it.each([
    {},
    { data_mart_id: '' },
    { data_mart_id: 'mart-1', project_id: 'foreign' },
    { data_mart_id: 'mart-1', user_id: 'other' },
    { data_mart_id: 'mart-1', roles: ['admin'] },
  ])('rejects invalid or untrusted input %j before validation', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.validateDataMartDefinition).not.toHaveBeenCalled();
  });

  it('propagates access failures rather than reporting an invalid definition', async () => {
    const error = new ForbiddenException('Access denied');
    facade.validateDataMartDefinition.mockRejectedValue(error);
    await expect(tool.handler({ data_mart_id: 'mart-1' }, mcpContext)).rejects.toBe(error);
  });
});
