import assert from 'node:assert';
import { describe, it } from 'node:test';
import { resolveValueList } from '../../src/Core/Declarative/valueList.js';

describe('resolveValueList', () => {
  it('returns a literal values array stringified', () => {
    assert.deepStrictEqual(resolveValueList({ values: ['US', 'UK'] }, {}), ['US', 'UK']);
    assert.deepStrictEqual(resolveValueList({ values: [1, 2] }, {}), ['1', '2']);
  });
  it('splits a comma string from valuesFromParameter, trimming and dropping empties', () => {
    const scope = { parameters: { AccountIds: ' 123 , 456 ,,789 ' } };
    assert.deepStrictEqual(resolveValueList({ valuesFromParameter: 'AccountIds' }, scope), [
      '123',
      '456',
      '789',
    ]);
  });
  it('splits a literal comma value', () => {
    assert.deepStrictEqual(resolveValueList({ value: 'a,b , c' }, {}), ['a', 'b', 'c']);
  });
  it('returns [] when the source is missing or empty', () => {
    assert.deepStrictEqual(
      resolveValueList({ valuesFromParameter: 'Missing' }, { parameters: {} }),
      []
    );
    assert.deepStrictEqual(resolveValueList({}, {}), []);
  });
});
