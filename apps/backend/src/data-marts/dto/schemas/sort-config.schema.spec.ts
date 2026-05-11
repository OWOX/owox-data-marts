import { SortConfigSchema } from './sort-config.schema';

describe('SortConfigSchema', () => {
  it('accepts null', () => {
    expect(SortConfigSchema.parse(null)).toBeNull();
  });
  it('accepts empty array', () => {
    expect(SortConfigSchema.parse([])).toEqual([]);
  });
  it('accepts asc/desc rules in order', () => {
    const input = [
      { column: 'date', direction: 'desc' },
      { column: 'amount', direction: 'asc' },
    ];
    expect(SortConfigSchema.parse(input)).toEqual(input);
  });
  it('rejects empty column', () => {
    expect(() => SortConfigSchema.parse([{ column: '', direction: 'asc' }])).toThrow();
  });
  it('rejects unknown direction', () => {
    expect(() => SortConfigSchema.parse([{ column: 'x', direction: 'random' }])).toThrow();
  });
});
