import assert from 'node:assert';
import { describe, it } from 'node:test';
import { formatCursorDate } from '../../src/Core/Declarative/dateFormat.js';

describe('formatCursorDate', () => {
  it('returns the date unchanged when no format is given', () => {
    assert.strictEqual(formatCursorDate('2026-01-02', undefined), '2026-01-02');
  });

  it('returns the date unchanged for the YYYY-MM-DD format (identity)', () => {
    assert.strictEqual(formatCursorDate('2026-01-02', 'YYYY-MM-DD'), '2026-01-02');
  });

  it('formats an ISO datetime with zeroed time components', () => {
    assert.strictEqual(
      formatCursorDate('2026-01-02', 'YYYY-MM-DDTHH:mm:ssZ'),
      '2026-01-02T00:00:00Z'
    );
  });

  it('supports reordered tokens and custom separators', () => {
    assert.strictEqual(formatCursorDate('2026-01-02', 'MM/DD/YYYY'), '01/02/2026');
  });

  it('formats unix epoch seconds for "X"', () => {
    assert.strictEqual(
      formatCursorDate('2026-01-02', 'X'),
      String(Math.floor(Date.UTC(2026, 0, 2) / 1000))
    );
  });

  it('formats unix epoch milliseconds for "x"', () => {
    assert.strictEqual(formatCursorDate('2026-01-02', 'x'), String(Date.UTC(2026, 0, 2)));
  });

  it('passes a null/empty date through unchanged', () => {
    assert.strictEqual(formatCursorDate(null, 'X'), null);
    assert.strictEqual(formatCursorDate('', 'X'), '');
  });

  it('passes a malformed date through unchanged (never crashes)', () => {
    assert.strictEqual(formatCursorDate('not-a-date', 'YYYY-MM-DDTHH:mm:ssZ'), 'not-a-date');
  });
});
