import { sanitizeSchema } from './sanitize-schema';

describe('sanitizeSchema', () => {
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

    expect(sanitizeSchema(input)).toEqual({
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

  it('does not mutate the source object', () => {
    const input = {
      fields: [{ name: 'id', status: 'connected' }],
    };

    const sanitized = sanitizeSchema(input);

    expect(sanitized).not.toBe(input);
    expect(sanitized.fields).not.toBe(input.fields);
    expect(input).toEqual({
      fields: [{ name: 'id', status: 'connected' }],
    });
  });

  it('keeps primitives and nullable values unchanged', () => {
    expect(sanitizeSchema(undefined)).toBeUndefined();
    expect(sanitizeSchema(null)).toBeNull();
    expect(sanitizeSchema('value')).toBe('value');
    expect(sanitizeSchema(42)).toBe(42);
    expect(sanitizeSchema(true)).toBe(true);
  });
});
