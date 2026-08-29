import assert from 'node:assert';
import { describe, it } from 'node:test';
import { RecordFilter } from '../../src/Core/Declarative/RecordFilter.js';

const keep = (config, record, scope = {}) => new RecordFilter(config).keep(record, scope);

describe('RecordFilter', () => {
  it('equals / notEquals', () => {
    assert.strictEqual(
      keep({ path: ['t'], operator: 'equals', value: 'GRID' }, { t: 'GRID' }),
      true
    );
    assert.strictEqual(
      keep({ path: ['t'], operator: 'equals', value: 'GRID' }, { t: 'LIST' }),
      false
    );
    assert.strictEqual(
      keep({ path: ['t'], operator: 'notEquals', value: 'GRID' }, { t: 'LIST' }),
      true
    );
    assert.strictEqual(
      keep({ path: ['t'], operator: 'notEquals', value: 'GRID' }, { t: 'GRID' }),
      false
    );
  });
  it('contains', () => {
    assert.strictEqual(
      keep({ path: ['m'], operator: 'contains', value: 'quota' }, { m: 'over quota now' }),
      true
    );
    assert.strictEqual(
      keep({ path: ['m'], operator: 'contains', value: 'quota' }, { m: 'fine' }),
      false
    );
  });
  it('isNull / isNotNull', () => {
    assert.strictEqual(keep({ path: ['x'], operator: 'isNotNull' }, { x: 0 }), true);
    assert.strictEqual(keep({ path: ['x'], operator: 'isNotNull' }, { x: false }), true);
    assert.strictEqual(keep({ path: ['x'], operator: 'isNotNull' }, {}), false);
    assert.strictEqual(keep({ path: ['x'], operator: 'isNull' }, {}), true);
    assert.strictEqual(keep({ path: ['x'], operator: 'isNull' }, { x: 'v' }), false);
  });
  it('inList via literal value and via parameter', () => {
    assert.strictEqual(
      keep({ path: ['id'], operator: 'inList', value: '1,2,3' }, { id: '2' }),
      true
    );
    assert.strictEqual(
      keep({ path: ['id'], operator: 'inList', value: '1,2,3' }, { id: '9' }),
      false
    );
    const scope = { parameters: { SurveyIds: '7,8' } };
    assert.strictEqual(
      keep(
        { path: ['id'], operator: 'inList', valuesFromParameter: 'SurveyIds' },
        { id: '8' },
        scope
      ),
      true
    );
  });
  it('inList re-resolves when the parameter changes, and reuses it when it does not', () => {
    // The resolved list is memoized per filter instance so it is not rebuilt for
    // every record. It must key on the parameter VALUE: keying on scope object
    // identity would rebuild for every fresh scope (no saving), and not keying
    // at all would answer a later, different scope from the first one's list.
    const f = new RecordFilter({
      path: ['id'],
      operator: 'inList',
      valuesFromParameter: 'Ids',
    });
    assert.strictEqual(f.keep({ id: '7' }, { parameters: { Ids: '7,8' } }), true);
    // A DIFFERENT scope object carrying the same value must still match.
    assert.strictEqual(f.keep({ id: '8' }, { parameters: { Ids: '7,8' } }), true);
    // A changed parameter must invalidate the memo, not reuse the stale list.
    assert.strictEqual(f.keep({ id: '7' }, { parameters: { Ids: '9' } }), false);
    assert.strictEqual(f.keep({ id: '9' }, { parameters: { Ids: '9' } }), true);
    // ...and back again.
    assert.strictEqual(f.keep({ id: '7' }, { parameters: { Ids: '7,8' } }), true);
  });

  it('inList with an unset parameter keeps nothing, on every record', () => {
    const f = new RecordFilter({ path: ['id'], operator: 'inList', valuesFromParameter: 'Ids' });
    assert.strictEqual(f.keep({ id: '7' }, { parameters: {} }), false);
    assert.strictEqual(f.keep({ id: '7' }, { parameters: {} }), false);
    // A value arriving later must still be picked up.
    assert.strictEqual(f.keep({ id: '7' }, { parameters: { Ids: '7' } }), true);
  });

  it('inList accepts a literal values array', () => {
    const f = new RecordFilter({ path: ['id'], operator: 'inList', values: [1, 2] });
    assert.strictEqual(f.keep({ id: 1 }, {}), true);
    assert.strictEqual(f.keep({ id: 3 }, {}), false);
  });

  it('missing-path behavior per operator', () => {
    assert.strictEqual(keep({ path: ['x'], operator: 'equals', value: 'a' }, {}), false);
    assert.strictEqual(keep({ path: ['x'], operator: 'notEquals', value: 'a' }, {}), true);
    assert.strictEqual(keep({ path: ['x'], operator: 'contains', value: 'a' }, {}), false);
    assert.strictEqual(keep({ path: ['x'], operator: 'inList', value: 'a' }, {}), false);
  });
});
