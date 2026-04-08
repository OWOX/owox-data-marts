import {
  BlendedFieldsConfigSchema,
  BlendedSourceSchema,
  BlendedFieldOverrideSchema,
  BlendingBehaviourEnum,
} from './blended-fields-config.schemas';

describe('BlendingBehaviourEnum', () => {
  it.each(['AUTO_BLEND_ALL', 'BLEND_DIRECT_ONLY', 'MANUAL'])(
    'should accept valid value: %s',
    value => {
      expect(BlendingBehaviourEnum.parse(value)).toBe(value);
    }
  );

  it('should reject invalid value', () => {
    expect(() => BlendingBehaviourEnum.parse('INVALID')).toThrow();
  });
});

describe('BlendedFieldOverrideSchema', () => {
  it('should accept empty object', () => {
    const result = BlendedFieldOverrideSchema.parse({});
    expect(result).toEqual({});
  });

  it('should accept isHidden only', () => {
    const result = BlendedFieldOverrideSchema.parse({ isHidden: true });
    expect(result.isHidden).toBe(true);
  });

  it('should accept aggregateFunction only', () => {
    const result = BlendedFieldOverrideSchema.parse({ aggregateFunction: 'SUM' });
    expect(result.aggregateFunction).toBe('SUM');
  });

  it('should reject invalid aggregateFunction', () => {
    expect(() => BlendedFieldOverrideSchema.parse({ aggregateFunction: 'INVALID' })).toThrow();
  });

  it.each(['STRING_AGG', 'MAX', 'MIN', 'SUM', 'COUNT', 'ANY_VALUE'])(
    'should accept aggregateFunction: %s',
    fn => {
      expect(BlendedFieldOverrideSchema.parse({ aggregateFunction: fn }).aggregateFunction).toBe(
        fn
      );
    }
  );
});

describe('BlendedSourceSchema', () => {
  it('should accept minimal valid source', () => {
    const result = BlendedSourceSchema.parse({ path: 'orders', alias: 'ord' });
    expect(result.path).toBe('orders');
    expect(result.alias).toBe('ord');
    expect(result.fields).toBeUndefined();
  });

  it('should accept source with fields', () => {
    const result = BlendedSourceSchema.parse({
      path: 'orders.products',
      alias: 'ord_prod',
      fields: {
        revenue: { aggregateFunction: 'SUM' },
        internal_id: { isHidden: true },
      },
    });
    expect(result.fields?.revenue?.aggregateFunction).toBe('SUM');
    expect(result.fields?.internal_id?.isHidden).toBe(true);
  });

  it('should reject empty path', () => {
    expect(() => BlendedSourceSchema.parse({ path: '', alias: 'a' })).toThrow();
  });

  it('should reject empty alias', () => {
    expect(() => BlendedSourceSchema.parse({ path: 'p', alias: '' })).toThrow();
  });
});

describe('BlendedFieldsConfigSchema', () => {
  it('should accept minimal config with empty sources', () => {
    const result = BlendedFieldsConfigSchema.parse({
      blendingBehaviour: 'AUTO_BLEND_ALL',
      sources: [],
    });
    expect(result.blendingBehaviour).toBe('AUTO_BLEND_ALL');
    expect(result.sources).toEqual([]);
  });

  it('should accept config with sources and overrides', () => {
    const result = BlendedFieldsConfigSchema.parse({
      blendingBehaviour: 'MANUAL',
      sources: [
        {
          path: 'all_bq_types.test_structure',
          alias: 'bq_test',
          fields: {
            revenue: { aggregateFunction: 'SUM' },
            internal_id: { isHidden: true },
          },
        },
      ],
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].path).toBe('all_bq_types.test_structure');
  });

  it('should reject missing blendingBehaviour', () => {
    expect(() => BlendedFieldsConfigSchema.parse({ sources: [] })).toThrow();
  });

  it('should reject missing sources', () => {
    expect(() =>
      BlendedFieldsConfigSchema.parse({ blendingBehaviour: 'AUTO_BLEND_ALL' })
    ).toThrow();
  });
});
