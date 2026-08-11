import { describe, it, expect } from 'vitest';
import { inferFieldsFromSample } from './inferFields';

describe('inferFieldsFromSample', () => {
  it('infers a field type per top-level key', () => {
    expect(
      inferFieldsFromSample({
        id: 5,
        price: 1.5,
        ok: true,
        name: 'x',
        tags: ['a'],
        meta: { z: 1 },
        none: null,
      })
    ).toEqual({
      id: { type: 'integer' },
      price: { type: 'number' },
      ok: { type: 'boolean' },
      name: { type: 'string' },
      tags: { type: 'string' },
      meta: { type: 'string' },
      none: { type: 'string' },
    });
  });

  it('returns {} for an empty, non-object, or array record', () => {
    expect(inferFieldsFromSample({})).toEqual({});
    expect(inferFieldsFromSample(null as unknown as Record<string, unknown>)).toEqual({});
    expect(inferFieldsFromSample([1, 2] as unknown as Record<string, unknown>)).toEqual({});
  });
});
