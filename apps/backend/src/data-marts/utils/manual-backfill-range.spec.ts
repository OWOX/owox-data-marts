import {
  countBackfillDays,
  getMaxManualBackfillDays,
  isManualBackfillPayload,
  parseManualBackfillRange,
  prepareManualBackfillPayload,
  readBackfillProgress,
  resumeManualBackfillPayload,
  unwrapRunPayload,
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

    it.each([
      ['no data at all', { runType: 'MANUAL_BACKFILL' }],
      ['data without StartDate', { runType: 'MANUAL_BACKFILL', data: { SheetId: 'abc' } }],
    ])('passes through a backfill for a connector with no date fields (%s)', (_label, payload) => {
      expect(prepareManualBackfillPayload(payload, TODAY)).toBe(payload);
    });

    it('accepts the date part of an ISO-8601 timestamp, as JSON.stringify(Date) produces', () => {
      expect(
        prepareManualBackfillPayload(
          {
            runType: 'MANUAL_BACKFILL',
            data: { StartDate: '2026-09-01T00:00:00.000Z', EndDate: '2026-09-10T12:34:56.000Z' },
          },
          TODAY
        )
      ).toEqual({
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-09-01', EndDate: '2026-09-10' },
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

  describe('unwrapRunPayload', () => {
    const body = { runType: 'MANUAL_BACKFILL', data: { StartDate: '2026-08-01' } };

    it('reads a first-attempt payload and a replayed run payload the same way', () => {
      // The sweep replays DataMartRun.additionalParams, which nests the body under `payload`.
      expect(unwrapRunPayload(body)).toEqual(body);
      expect(unwrapRunPayload({ payload: body, backfillProgress: { cfg: '2026-08-03' } })).toEqual(
        body
      );
    });

    it('returns an empty body for anything that is not an object', () => {
      expect(unwrapRunPayload(null)).toEqual({});
      expect(unwrapRunPayload(undefined)).toEqual({});
      expect(unwrapRunPayload(['nope'])).toEqual({});
    });
  });

  describe('isManualBackfillPayload', () => {
    it('recognizes only the manual backfill run type', () => {
      expect(isManualBackfillPayload({ runType: 'MANUAL_BACKFILL' })).toBe(true);
      expect(isManualBackfillPayload({ runType: 'INCREMENTAL' })).toBe(false);
      expect(isManualBackfillPayload({})).toBe(false);
    });
  });

  describe('readBackfillProgress', () => {
    it('reads the per-configuration progress recorded by earlier attempts', () => {
      expect(
        readBackfillProgress({ backfillProgress: { 'cfg-1': '2026-08-11', 'cfg-2': '2026-08-09' } })
      ).toEqual({ 'cfg-1': '2026-08-11', 'cfg-2': '2026-08-09' });
    });

    it('normalizes a date a connector serialized as a full timestamp', () => {
      expect(
        readBackfillProgress({ backfillProgress: { 'cfg-1': '2026-08-11T00:00:00.000Z' } })
      ).toEqual({ 'cfg-1': '2026-08-11' });
    });

    it('keeps the configurations whose progress is usable when one entry is corrupt', () => {
      // Discarding the whole map would silently re-import days that were already stored.
      expect(
        readBackfillProgress({ backfillProgress: { 'cfg-1': '2026-08-11', 'cfg-2': 'yesterday' } })
      ).toEqual({ 'cfg-1': '2026-08-11' });
    });

    it('returns nothing when the run has no usable progress', () => {
      expect(readBackfillProgress(undefined)).toEqual({});
      expect(readBackfillProgress({})).toEqual({});
      expect(readBackfillProgress({ backfillProgress: 'corrupt' })).toEqual({});
    });
  });

  describe('resumeManualBackfillPayload', () => {
    const backfill = (data: Record<string, unknown>) => ({ runType: 'MANUAL_BACKFILL', data });

    it('starts the retry on the day after the last one fully loaded', () => {
      const body = backfill({ StartDate: '2026-08-01', EndDate: '2026-08-20' });

      expect(resumeManualBackfillPayload(body, '2026-08-11')).toEqual({
        body: backfill({ StartDate: '2026-08-12', EndDate: '2026-08-20' }),
        resumedFrom: '2026-08-12',
        lastLoadedDate: '2026-08-11',
      });
    });

    it('crosses a month boundary correctly', () => {
      const body = backfill({ StartDate: '2026-07-25', EndDate: '2026-08-05' });

      expect(resumeManualBackfillPayload(body, '2026-07-31').resumedFrom).toBe('2026-08-01');
    });

    it('preserves the other run parameters', () => {
      const body = backfill({ StartDate: '2026-08-01', EndDate: '2026-08-20', AccountId: '42' });

      expect(resumeManualBackfillPayload(body, '2026-08-11').body).toEqual(
        backfill({ StartDate: '2026-08-12', EndDate: '2026-08-20', AccountId: '42' })
      );
    });

    it('clamps to EndDate and reports no resume when the whole period was loaded', () => {
      // Re-importing one stored day is idempotent, and keeps a single execution path.
      const body = backfill({ StartDate: '2026-08-01', EndDate: '2026-08-20' });

      expect(resumeManualBackfillPayload(body, '2026-08-20')).toEqual({
        body: backfill({ StartDate: '2026-08-20', EndDate: '2026-08-20' }),
        resumedFrom: '2026-08-20',
        lastLoadedDate: '2026-08-20',
      });
    });

    it('leaves a single-day period untouched once it is loaded', () => {
      const body = backfill({ StartDate: '2026-08-20', EndDate: '2026-08-20' });

      expect(resumeManualBackfillPayload(body, '2026-08-20')).toEqual({ body });
    });

    it('ignores progress that predates the requested period', () => {
      // It belongs to a different period; honouring it would widen the run past the day limit.
      const body = backfill({ StartDate: '2026-08-10', EndDate: '2026-08-20' });

      expect(resumeManualBackfillPayload(body, '2026-07-01')).toEqual({ body });
    });

    it('ignores an unusable progress date', () => {
      const body = backfill({ StartDate: '2026-08-01', EndDate: '2026-08-20' });

      expect(resumeManualBackfillPayload(body, 'not-a-date')).toEqual({ body });
      expect(resumeManualBackfillPayload(body, undefined)).toEqual({ body });
    });

    it('leaves an incremental run untouched', () => {
      const body = { runType: 'INCREMENTAL', data: {} };

      expect(resumeManualBackfillPayload(body, '2026-08-11')).toEqual({ body });
    });

    it('leaves a backfill without a normalized period untouched', () => {
      // A connector that declares no date fields treats a backfill as a full refresh.
      const noDates = backfill({});
      const noEnd = backfill({ StartDate: '2026-08-01' });

      expect(resumeManualBackfillPayload(noDates, '2026-08-11')).toEqual({ body: noDates });
      expect(resumeManualBackfillPayload(noEnd, '2026-08-11')).toEqual({ body: noEnd });
    });
  });
});
