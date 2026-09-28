import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// AbstractConnector only references AbstractStorage/AbstractRunConfig inside the
// constructor, so loading the real constants file is enough to exercise the
// date-range method on the prototype without instantiating anything.
loadGasClass(path.join(__dirname, '../../src/Constants/CommonConstants.js'));
loadGasClass(path.join(__dirname, '../../src/Core/AbstractConnector.js'));
const proto = globalThis.AbstractConnector.prototype;

const rangeFor = (start, end) =>
  proto._getManualBackfillDateRange.call({
    config: {
      StartDate: { value: new Date(start) },
      EndDate: { value: new Date(end) },
      logMessage: () => {},
    },
  });

describe('_getManualBackfillDateRange', () => {
  it('accepts a full 31-day calendar month as one run', () => {
    const [startDate, daysToFetch] = rangeFor('2026-07-01', '2026-07-31');

    expect(startDate.toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(daysToFetch).toBe(31);
  });

  it('rejects a range longer than MAX_MANUAL_BACKFILL_DAYS', () => {
    expect(() => rangeFor('2026-07-01', '2026-08-01')).toThrow(
      'Manual backfill is limited to 31 days per run (requested 32 days)'
    );
  });
});
