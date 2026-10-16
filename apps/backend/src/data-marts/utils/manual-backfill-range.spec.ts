import {
  BackfillChainMeta,
  backfillSegmentWindow,
  clampBackfillWindow,
  countBackfillDays,
  countBackfillSegments,
  getMaxManualBackfillDays,
  isManualBackfillPayload,
  nextBackfillChainStep,
  parseManualBackfillRange,
  planBackfillChain,
  prepareManualBackfillPayload,
  readBackfillChainMeta,
  readBackfillProgress,
  readBackfillRange,
  resumeManualBackfillPayload,
  unwrapRunPayload,
  withBackfillEndDate,
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

    it('accepts the earliest allowed StartDate', () => {
      expect(
        parseManualBackfillRange({ StartDate: '2000-01-01', EndDate: '2000-01-31' }, TODAY)
      ).toEqual({ startDate: '2000-01-01', endDate: '2000-01-31' });
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
      [{ StartDate: '1999-12-31' }, 'StartDate cannot be earlier than 2000-01-01'],
      [{ StartDate: '0202-01-01' }, 'StartDate cannot be earlier than 2000-01-01'],
      [{ StartDate: '2026-09-01', EndDate: 'soon' }, 'EndDate must be'],
      [{ StartDate: '2026-09-01', EndDate: '2026-02-30' }, 'EndDate must be'],
      [{ StartDate: 20260901 }, 'StartDate is required'],
      [{ StartDate: '2026-09-10', EndDate: '2026-09-01' }, 'EndDate cannot be earlier'],
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

    it.each([32, 365, 3650])('accepts a %i-day range, which runs as several segments', days => {
      const start = Date.parse('2026-09-17T00:00:00.000Z') - (days - 1) * 86_400_000;
      const startDate = new Date(start).toISOString().slice(0, 10);

      expect(parseManualBackfillRange({ StartDate: startDate }, TODAY)).toEqual({
        startDate,
        endDate: '2026-09-17',
      });
    });
  });

  describe('segments', () => {
    const range = (startDate: string, endDate: string) => ({ startDate, endDate });

    it.each([
      [1, 1],
      [31, 1],
      [32, 2],
      [62, 2],
      [63, 3],
      [547, 18],
    ])('covers %i days with %i segments', (days, segments) => {
      const start = Date.parse('2024-01-01T00:00:00.000Z');
      const end = new Date(start + (days - 1) * 86_400_000).toISOString().slice(0, 10);

      expect(countBackfillSegments(range('2024-01-01', end), 31)).toBe(segments);
    });

    it.each([
      ['one day', range('2026-09-01', '2026-09-01'), '2026-09-01'],
      ['exactly the limit', range('2026-08-01', '2026-08-31'), '2026-08-31'],
      ['one day over', range('2026-08-01', '2026-09-01'), '2026-08-31'],
      ['a leap day inside', range('2024-02-15', '2024-04-30'), '2024-03-16'],
      ['a year boundary', range('2024-12-15', '2025-01-20'), '2025-01-14'],
    ])('clamps %s to a window of at most 31 days', (_name, requested, windowEnd) => {
      expect(clampBackfillWindow(requested, 31)).toEqual({
        startDate: requested.startDate,
        endDate: windowEnd,
      });
    });

    it('tiles the requested range with consecutive windows, no gap and no overlap', () => {
      const requested = range('2024-01-01', '2025-06-30');
      const total = countBackfillSegments(requested, 31);
      const windows = Array.from({ length: total }, (_, i) =>
        backfillSegmentWindow(requested, i + 1, 31)
      );

      expect(windows[0].startDate).toBe(requested.startDate);
      expect(windows.at(-1)?.endDate).toBe(requested.endDate);
      expect(windows.reduce((days, w) => days + countBackfillDays(w), 0)).toBe(
        countBackfillDays(requested)
      );
      windows.slice(1).forEach((window, index) => {
        const previous = windows[index];
        expect(countBackfillDays(range(previous.endDate, window.startDate))).toBe(2);
      });
      expect(windows.every(w => countBackfillDays(w) <= 31)).toBe(true);
    });
  });

  describe('backfill chain', () => {
    const payload = {
      runType: 'MANUAL_BACKFILL',
      data: { StartDate: '2024-01-01', EndDate: '2025-06-30', AccountId: '42' },
    };

    it('plans a long backfill as segment 1 of a chain, keeping other fields', () => {
      const plan = planBackfillChain(payload, 'chain-1')!;

      expect(plan.payload).toEqual({
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2024-01-01', EndDate: '2024-01-31', AccountId: '42' },
      });
      expect(plan.meta).toEqual({
        id: 'chain-1',
        requestedStart: '2024-01-01',
        requestedEnd: '2025-06-30',
        segmentIndex: 1,
        segmentsTotal: 18,
        segmentDays: 31,
      });
    });

    it('keeps the segment size the chain was planned with when the default changes', () => {
      const plannedMeta: BackfillChainMeta = { ...planBackfillChain(payload, 'chain-1')!.meta };

      // A later release lowering the segment size must not re-tile a chain already running.
      const step = nextBackfillChainStep(
        { ...plannedMeta, segmentIndex: 2 },
        { segmentSucceeded: true, anyProgressAdvanced: true },
        10
      );

      expect(step).toMatchObject({
        action: 'continue',
        window: { startDate: '2024-03-03', endDate: '2024-04-02' },
      });
    });

    it('falls back to the default segment size for a chain stored without one', () => {
      const { segmentDays: _segmentDays, ...legacyMeta } = planBackfillChain(
        payload,
        'chain-1'
      )!.meta;

      expect(readBackfillChainMeta({ backfill: legacyMeta })).toEqual(legacyMeta);
      expect(
        nextBackfillChainStep(
          { ...legacyMeta, segmentIndex: 2 },
          { segmentSucceeded: true, anyProgressAdvanced: true },
          31
        )
      ).toMatchObject({ window: { startDate: '2024-03-03', endDate: '2024-04-02' } });
    });

    it.each([
      ['undefined', undefined],
      ['an incremental run', { runType: 'INCREMENTAL' }],
      ['a backfill without date fields', { runType: 'MANUAL_BACKFILL', data: { SheetId: 'x' } }],
      [
        'a period that fits one segment',
        { runType: 'MANUAL_BACKFILL', data: { StartDate: '2026-08-01', EndDate: '2026-08-31' } },
      ],
    ])('does not plan a chain for %s', (_label, body) => {
      expect(planBackfillChain(body, 'chain-1')).toBeUndefined();
    });

    it('reads the chain metadata back from additionalParams and tolerates junk', () => {
      const meta = planBackfillChain(payload, 'chain-1')!.meta;

      expect(readBackfillChainMeta({ payload, backfill: meta })).toEqual(meta);
      expect(readBackfillChainMeta({ payload })).toBeUndefined();
      expect(readBackfillChainMeta({ backfill: { id: '' } })).toBeUndefined();
      expect(readBackfillChainMeta(null)).toBeUndefined();
    });

    describe('nextBackfillChainStep', () => {
      const meta: BackfillChainMeta = planBackfillChain(payload, 'chain-1')!.meta;

      it('continues a completed segment with the next window', () => {
        const step = nextBackfillChainStep(
          { ...meta, segmentIndex: 2 },
          { segmentSucceeded: true, anyProgressAdvanced: true },
          31
        );

        expect(step).toEqual({
          action: 'continue',
          meta: { ...meta, segmentIndex: 3 },
          window: { startDate: '2024-03-03', endDate: '2024-04-02' },
        });
      });

      it('continues past a failed segment (failure isolation)', () => {
        const step = nextBackfillChainStep(
          meta,
          { segmentSucceeded: false, anyProgressAdvanced: true },
          31
        );

        expect(step).toMatchObject({ action: 'continue', meta: { segmentIndex: 2 } });
      });

      it('continues after repeated failures, to the last segment', () => {
        let step = nextBackfillChainStep(
          meta,
          { segmentSucceeded: false, anyProgressAdvanced: true },
          31
        );
        for (let index = 2; index < meta.segmentsTotal; index++) {
          expect(step).toMatchObject({ action: 'continue', meta: { segmentIndex: index } });
          step = nextBackfillChainStep(
            (step as Extract<typeof step, { action: 'continue' }>).meta,
            { segmentSucceeded: false, anyProgressAdvanced: false },
            31
          );
        }

        expect(step).toMatchObject({ action: 'continue', meta: { segmentIndex: 18 } });
        expect(
          nextBackfillChainStep(
            (step as Extract<typeof step, { action: 'continue' }>).meta,
            { segmentSucceeded: false, anyProgressAdvanced: false },
            31
          )
        ).toEqual({ action: 'end', chainEnd: 'finished' });
      });

      it('walks a year Jan→Dec one segment per terminal step, with no gap or overlap', () => {
        const year = planBackfillChain(
          { runType: 'MANUAL_BACKFILL', data: { StartDate: '2026-01-01', EndDate: '2026-12-31' } },
          'chain-year'
        )!;
        const requested = { startDate: '2026-01-01', endDate: '2026-12-31' };
        const windows = [backfillSegmentWindow(requested, 1, 31)];
        let meta = year.meta;

        // Alternate failed/completed: the walk must not depend on how a segment ended.
        for (let step = 1; ; step++) {
          const next = nextBackfillChainStep(
            meta,
            { segmentSucceeded: step % 2 === 0, anyProgressAdvanced: true },
            31
          );
          if (next.action === 'end') break;
          expect(next.meta.segmentIndex).toBe(meta.segmentIndex + 1);
          windows.push(next.window);
          meta = next.meta;
        }

        expect(windows).toHaveLength(12);
        expect(windows[0].startDate).toBe('2026-01-01');
        expect(windows.at(-1)?.endDate).toBe('2026-12-31');
        expect(windows.every(w => countBackfillDays(w) <= 31)).toBe(true);
        expect(windows.reduce((days, w) => days + countBackfillDays(w), 0)).toBe(365);
        windows.slice(1).forEach((window, index) => {
          expect(
            countBackfillDays({ startDate: windows[index].endDate, endDate: window.startDate })
          ).toBe(2);
        });
      });

      it('finishes on the last segment', () => {
        expect(
          nextBackfillChainStep(
            { ...meta, segmentIndex: 18 },
            { segmentSucceeded: true, anyProgressAdvanced: true },
            31
          )
        ).toEqual({ action: 'end', chainEnd: 'finished' });
      });

      it('finishes when a completed segment recorded no date checkpoint (dateless connector)', () => {
        expect(
          nextBackfillChainStep(meta, { segmentSucceeded: true, anyProgressAdvanced: false }, 31)
        ).toEqual({ action: 'end', chainEnd: 'finished' });
      });

      it('does not treat a failed segment without progress as a dateless connector', () => {
        expect(
          nextBackfillChainStep(meta, { segmentSucceeded: false, anyProgressAdvanced: false }, 31)
        ).toMatchObject({ action: 'continue' });
      });
    });
  });

  describe('readBackfillRange and withBackfillEndDate', () => {
    const body = {
      runType: 'MANUAL_BACKFILL',
      data: { StartDate: '2026-08-01', EndDate: '2026-09-10', Other: 'x' },
    };

    it('reads the period of a normalized backfill body', () => {
      expect(readBackfillRange(body)).toEqual({ startDate: '2026-08-01', endDate: '2026-09-10' });
    });

    it.each([
      ['an incremental run', { runType: 'INCREMENTAL', data: body.data }],
      ['a body without dates', { runType: 'MANUAL_BACKFILL', data: {} }],
      ['a body without EndDate', { runType: 'MANUAL_BACKFILL', data: { StartDate: '2026-08-01' } }],
    ])('returns undefined for %s', (_name, input) => {
      expect(readBackfillRange(input)).toBeUndefined();
    });

    it('replaces EndDate without touching the original body', () => {
      expect(withBackfillEndDate(body, '2026-08-31')).toEqual({
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-08-01', EndDate: '2026-08-31', Other: 'x' },
      });
      expect(body.data.EndDate).toBe('2026-09-10');
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
      // It belongs to a different period; honouring it would widen the run past the period.
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
