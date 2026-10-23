import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { ValidateDataMartFormulaTool } from './validate-data-mart-formula.tool';

describe('ValidateDataMartFormulaTool', () => {
  const facade = { validateDataMartFormula: jest.fn() };
  const tool = new ValidateDataMartFormulaTool(facade as unknown as McpDataMartSetupFacade);
  const input = {
    data_mart_id: 'mart-1',
    name: 'profit',
    type: 'FLOAT',
    formula: '{{ref field="revenue"}} - {{ref field="cost"}}',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    facade.validateDataMartFormula.mockResolvedValue({
      errors: [],
      warnings: [],
      otherFieldErrors: [],
    });
  });

  it('uses the saved schema when draft siblings are omitted', async () => {
    const result = await tool.handler(input, mcpContext);
    expect(facade.validateDataMartFormula).toHaveBeenCalledWith(setupContext, {
      dataMartId: 'mart-1',
      name: 'profit',
      type: 'FLOAT',
      formula: '{{ref field="revenue"}} - {{ref field="cost"}}',
    });
    expect(result.structuredContent).toEqual({ errors: [], warnings: [], other_field_errors: [] });
    expect(tool.requiredScopes).toEqual(['mcp:read']);
  });

  it.each([
    { calculated_fields: [] },
    {
      calculated_fields: [
        { name: 'revenue', type: 'FLOAT', formula: 'SUM({{ref field="amount"}})' },
      ],
    },
  ])(
    'forwards explicit draft sibling lists without dropping an empty list: %j',
    async ({ calculated_fields }) => {
      await tool.handler({ ...input, calculated_fields }, mcpContext);
      expect(facade.validateDataMartFormula).toHaveBeenCalledWith(setupContext, {
        dataMartId: 'mart-1',
        name: 'profit',
        type: 'FLOAT',
        formula: input.formula,
        calculatedFields: calculated_fields,
      });
    }
  );

  it('returns current and sibling errors plus warnings using the MCP output keys', async () => {
    const errors = [
      { code: 'MISSING_REF', message: 'Missing revenue', field: 'profit', subject: 'revenue' },
    ];
    const warnings = [{ code: 'WARNING', message: 'Check aggregation', field: 'profit' }];
    const otherFieldErrors = [{ code: 'CYCLE', message: 'Cyclic formula', field: 'ratio' }];
    facade.validateDataMartFormula.mockResolvedValue({ errors, warnings, otherFieldErrors });
    const result = await tool.handler(input, mcpContext);
    expect(result.structuredContent).toEqual({
      errors,
      warnings,
      other_field_errors: otherFieldErrors,
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
  });

  it.each([
    ['empty target', { data_mart_id: '' }],
    ['empty field name', { name: '' }],
    ['empty field type', { type: '' }],
    ['empty formula', { formula: '' }],
    ['overlong formula', { formula: '1'.repeat(10001) }],
    ['invalid draft sibling', { calculated_fields: [{ name: 'x', type: 'FLOAT', formula: '' }] }],
    [
      'too many draft siblings',
      { calculated_fields: Array(101).fill({ name: 'x', type: 'FLOAT', formula: '1' }) },
    ],
    ['project override', { project_id: 'foreign' }],
    ['actor override', { user_id: 'other' }],
    ['role override', { roles: ['admin'] }],
  ] as const)('rejects %s before calling the formula validator', async (_name, properties) => {
    await expect(tool.handler({ ...input, ...properties } as never, mcpContext)).rejects.toThrow();
    expect(facade.validateDataMartFormula).not.toHaveBeenCalled();
  });

  it('accepts maximum formula and draft sibling limits', () => {
    expect(() =>
      tool.parseInput({
        ...input,
        formula: '1'.repeat(10000),
        calculated_fields: Array(100).fill({
          name: 'x',
          type: 'FLOAT',
          formula: '1'.repeat(10000),
        }),
      })
    ).not.toThrow();
  });

  it('propagates resource access failures', async () => {
    const error = new ForbiddenException('Access denied');
    facade.validateDataMartFormula.mockRejectedValue(error);
    await expect(tool.handler(input, mcpContext)).rejects.toBe(error);
  });
});
