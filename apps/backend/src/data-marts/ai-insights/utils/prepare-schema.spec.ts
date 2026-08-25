import { prepareSchema } from './prepare-schema';

describe('prepareSchema', () => {
  it('removes status recursively from nested objects and arrays', () => {
    const input = {
      type: 'bigquery-data-mart-schema',
      status: 'root',
      fields: [
        {
          name: 'campaign_id',
          status: 'connected',
          metadata: { status: 'internal', hint: 'id' },
        },
        {
          name: 'geo',
          status: 'connected',
          fields: [
            { name: 'country', status: 'connected' },
            { name: 'city', status: 'disconnected' },
          ],
        },
      ],
      tags: [{ label: 'a', status: 'x' }, { label: 'b' }],
    };

    expect(prepareSchema(input)).toEqual({
      type: 'bigquery-data-mart-schema',
      fields: [
        {
          name: 'campaign_id',
          metadata: { hint: 'id' },
        },
        {
          name: 'geo',
          fields: [{ name: 'country' }, { name: 'city' }],
        },
      ],
      tags: [{ label: 'a' }, { label: 'b' }],
    });
  });

  it('removes alias and maps it to businessName if present', () => {
    const input = {
      fields: [
        {
          name: 'revenue',
          alias: 'Total Revenue',
          description: 'Money earned',
        },
        {
          name: 'cost',
          alias: 'Total Cost',
        },
        {
          name: 'margin',
          description: 'Profit margin',
        },
        {
          name: 'empty_alias',
          alias: '  ',
          description: 'Empty alias test',
        },
      ],
    };

    expect(prepareSchema(input)).toEqual({
      fields: [
        {
          name: 'revenue',
          businessName: 'Total Revenue',
          description: 'Money earned',
        },
        {
          name: 'cost',
          businessName: 'Total Cost',
        },
        {
          name: 'margin',
          description: 'Profit margin',
        },
        {
          name: 'empty_alias',
          description: 'Empty alias test',
        },
      ],
    });
  });

  it('does not mutate the source object', () => {
    const input = {
      fields: [{ name: 'id', status: 'connected', alias: 'Identifier', description: 'ID field' }],
    };

    const prepared = prepareSchema(input);

    expect(prepared).not.toBe(input);
    expect(prepared.fields).not.toBe(input.fields);
    expect(input).toEqual({
      fields: [{ name: 'id', status: 'connected', alias: 'Identifier', description: 'ID field' }],
    });
  });

  it("strips a calculated field's stored formula but keeps the metric marker", () => {
    const input = {
      fields: [
        {
          name: 'ctr',
          type: 'FLOAT',
          description: 'Clicks per impression.',
          calculated: {
            formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
            level: 'metric',
            warehouseValidation: 'passed',
          },
        },
      ],
    };

    const prepared = prepareSchema(input);

    expect(JSON.stringify(prepared)).not.toContain('{{ref');
    expect(prepared).toEqual({
      fields: [
        {
          name: 'ctr',
          type: 'FLOAT',
          description: 'Clicks per impression.',
          calculated: { level: 'metric', warehouseValidation: 'passed' },
        },
      ],
    });
    expect(input.fields[0].calculated.formula).toContain('{{ref');
  });

  it('keeps primitives and nullable values unchanged', () => {
    expect(prepareSchema(undefined)).toBeUndefined();
    expect(prepareSchema(null)).toBeNull();
    expect(prepareSchema('value')).toBe('value');
    expect(prepareSchema(42)).toBe(42);
    expect(prepareSchema(true)).toBe(true);
  });
});
