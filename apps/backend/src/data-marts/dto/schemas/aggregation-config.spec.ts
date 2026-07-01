import { AggregationRuleSchema } from './aggregation-config.schema';
import { BlendedFieldsConfigSchema } from './blended-fields-config.schema';

describe('AggregationRuleSchema', () => {
  it('accepts SUM (existing function still works)', () => {
    expect(AggregationRuleSchema.safeParse({ column: 'revenue', function: 'SUM' }).success).toBe(
      true
    );
  });

  it('accepts P75 (new percentile function)', () => {
    expect(AggregationRuleSchema.safeParse({ column: 'price', function: 'P75' }).success).toBe(
      true
    );
  });

  it('rejects INVALID function', () => {
    expect(AggregationRuleSchema.safeParse({ column: 'price', function: 'INVALID' }).success).toBe(
      false
    );
  });
});

describe('BlendedFieldsConfigSchema enum isolation', () => {
  it('still REJECTS P75 (blend enum is separate from report enum)', () => {
    const result = BlendedFieldsConfigSchema.safeParse({
      sources: [
        {
          path: 'orders',
          alias: 'Orders',
          fields: {
            f1: { aggregateFunction: 'P75' },
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
