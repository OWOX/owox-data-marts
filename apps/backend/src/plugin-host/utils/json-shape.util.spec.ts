import { findJsonShapeProblem } from './json-shape.util';

function nested(depth: number): unknown {
  let value: unknown = [];
  for (let level = 1; level < depth; level += 1) value = [value];
  return value;
}

describe('findJsonShapeProblem', () => {
  it('refuses nesting deeper than 100 levels only', () => {
    expect(findJsonShapeProblem(nested(100))).toBeNull();
    expect(findJsonShapeProblem({ a: nested(100) })).toBe('is nested deeper than 100 levels');
  });

  it('accepts a lone surrogate and a key over 65,535 bytes, which a text column stores', () => {
    expect(findJsonShapeProblem({ title: 'a\ud800', ['\udc00']: 1 })).toBeNull();
    expect(findJsonShapeProblem({ ['k'.repeat(65_536)]: 1 })).toBeNull();
  });
});
