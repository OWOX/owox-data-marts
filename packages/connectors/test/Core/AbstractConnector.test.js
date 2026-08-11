import { describe, expect, it } from 'vitest';
import { AbstractConnector } from '../../src/Core/AbstractConnector.js';
import { RUN_CONFIG_TYPE } from '../../src/Constants/CommonConstants.js';

// The date-range methods read only the run config and the logger, so they can be exercised
// on the prototype without constructing a connector (which would want a source and a
// storage class). Built on the real prototype so the date helpers they call run for real.
const rangeFor = (start, end) =>
  Object.assign(Object.create(AbstractConnector.prototype), {
    context: {
      runConfig: {
        type: RUN_CONFIG_TYPE.MANUAL_BACKFILL,
        data: [
          { configField: 'StartDate', value: start },
          { configField: 'EndDate', value: end },
        ],
      },
      log: () => {},
    },
  })._getManualBackfillDateRange();

describe('_getManualBackfillDateRange', () => {
  it('accepts a full 31-day calendar month as one run', () => {
    const range = rangeFor('2026-07-01', '2026-07-31');

    expect(range.startDate).toBe('2026-07-01');
    expect(range.endDate).toBe('2026-07-31');
  });

  /**
   * The cap is a last line of defence, not the primary one: the backend refuses a longer
   * range before the run is created. It matters here because a day-by-day node issues one
   * request per account per day, so a range that slipped past the backend — over MCP, or
   * through `owox-ctl` — holds a concurrency slot for hours before anything notices.
   */
  it('rejects a range longer than MAX_MANUAL_BACKFILL_DAYS', () => {
    expect(() => rangeFor('2026-07-01', '2026-08-01')).toThrow(
      'Manual backfill is limited to 31 days per run (requested 32 days)'
    );
  });
});
