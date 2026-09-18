import {
  countBackfillDays,
  getMaxManualBackfillDays,
  parseManualBackfillRange,
  prepareManualBackfillPayload,
} from './manual-backfill-range';

const TODAY = new Date('2026-09-17T15:30:00.000Z');

describe('manual-backfill-range', () => {
  it('reads the limit from the connectors package', () => {
    expect(getMaxManualBackfillDays()).toBe(31);
  });

  describe('parseManualBackfillRange', () => {
    it('defaults EndDate to today and clamps a future EndDate to today', () => {
      expect(parseManualBackfillRange({ StartDate: '2026-09-01' }, TODAY)).toEqual({
        startDate: '2026-09-01',
        endDate: '2026-09-17',
      });
      expect(
        parseManualBackfillRange({ StartDate: '2026-09-01', EndDate: '2026-12-31' }, TODAY)
      ).toEqual({ startDate: '2026-09-01', endDate: '2026-09-17' });
    });

    it('accepts a full calendar month as one run', () => {
      expect(
        parseManualBackfillRange({ StartDate: '2026-07-01', EndDate: '2026-07-31' }, TODAY)
      ).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' });
    });

    it.each([
      [{}, 'StartDate is required'],
      [{ StartDate: '01/09/2026' }, 'StartDate is required'],
      [{ StartDate: '2026-02-30' }, 'StartDate is required'],
      [{ StartDate: '2026-09-18' }, 'StartDate cannot be in the future'],
      [{ StartDate: '2026-09-01', EndDate: 'soon' }, 'EndDate must be'],
      [{ StartDate: '2026-09-01', EndDate: '2026-02-30' }, 'EndDate must be'],
      [{ StartDate: 20260901 }, 'StartDate is required'],
      [{ StartDate: '2026-09-10', EndDate: '2026-09-01' }, 'EndDate cannot be earlier'],
      [
        { StartDate: '2026-07-01', EndDate: '2026-08-01' },
        'Manual backfill is limited to 31 days per run (requested 32 days)',
      ],
      // No EndDate means "until today", which is also subject to the limit.
      [{ StartDate: '2026-06-01' }, 'Manual backfill is limited to 31 days per run'],
    ])('rejects %j', (data, message) => {
      expect(() => parseManualBackfillRange(data, TODAY)).toThrow(message);
    });
  });

  it('counts inclusive days', () => {
    expect(countBackfillDays({ startDate: '2026-07-01', endDate: '2026-07-01' })).toBe(1);
    expect(countBackfillDays({ startDate: '2026-07-01', endDate: '2026-07-31' })).toBe(31);
    expect(countBackfillDays({ startDate: '2026-07-10', endDate: '2026-07-01' })).toBe(0);
  });

  describe('prepareManualBackfillPayload', () => {
    it('passes through incremental payloads and undefined', () => {
      const incremental = { runType: 'INCREMENTAL' };
      expect(prepareManualBackfillPayload(incremental, TODAY)).toBe(incremental);
      expect(prepareManualBackfillPayload(undefined, TODAY)).toBeUndefined();
    });

    it('normalizes the dates and keeps other fields', () => {
      expect(
        prepareManualBackfillPayload(
          { runType: 'MANUAL_BACKFILL', data: { StartDate: '2026-09-01', AccountId: '42' } },
          TODAY
        )
      ).toEqual({
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-09-01', EndDate: '2026-09-17', AccountId: '42' },
      });
    });

    it('rejects a range longer than the limit', () => {
      expect(() =>
        prepareManualBackfillPayload(
          { runType: 'MANUAL_BACKFILL', data: { StartDate: '2026-06-01', EndDate: '2026-09-15' } },
          TODAY
        )
      ).toThrow('Manual backfill is limited to 31 days per run (requested 107 days)');
    });
  });
});
