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
  it('missing-path behavior per operator', () => {
    assert.strictEqual(keep({ path: ['x'], operator: 'equals', value: 'a' }, {}), false);
    assert.strictEqual(keep({ path: ['x'], operator: 'notEquals', value: 'a' }, {}), true);
    assert.strictEqual(keep({ path: ['x'], operator: 'contains', value: 'a' }, {}), false);
    assert.strictEqual(keep({ path: ['x'], operator: 'inList', value: 'a' }, {}), false);
  });
});
