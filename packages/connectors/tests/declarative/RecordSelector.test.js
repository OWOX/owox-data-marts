import assert from 'node:assert';
import { describe, it } from 'node:test';
import { RecordSelector } from '../../src/Core/Declarative/RecordSelector.js';

describe('RecordSelector', () => {
  it('extracts an array at a nested recordPath', () => {
    const sel = new RecordSelector({ recordPath: ['data', 'rows'] });
    const records = sel.extract({ data: { rows: [{ a: 1 }, { a: 2 }] } });
    assert.deepStrictEqual(records, [{ a: 1 }, { a: 2 }]);
  });

  it('wraps a single object at the path into a one-element array', () => {
    const sel = new RecordSelector({ recordPath: ['rates'] });
    const records = sel.extract({ rates: { USD: 1 } });
    assert.deepStrictEqual(records, [{ USD: 1 }]);
  });

  it('returns the whole body as one record when recordPath is empty', () => {
    const sel = new RecordSelector({ recordPath: [] });
    assert.deepStrictEqual(sel.extract({ a: 1 }), [{ a: 1 }]);
  });

  it('returns empty array when the path is missing', () => {
    const sel = new RecordSelector({ recordPath: ['nope'] });
    assert.deepStrictEqual(sel.extract({ data: [] }), []);
  });
});
