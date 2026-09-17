import {
  MAX_MANUAL_BACKFILL_DAYS,
  buildNextBackfillChunkPayload,
  countBackfillDays,
  parseManualBackfillRange,
  prepareManualBackfillPayload,
  readBackfillChain,
  splitBackfillRange,
} from './manual-backfill-range';

const TODAY = new Date('2026-09-17T15:30:00.000Z');

describe('manual-backfill-range', () => {
  it('uses the limit owned by the connectors package', () => {
    expect(MAX_MANUAL_BACKFILL_DAYS).toBe(31);
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

    it.each([
      [{}, 'StartDate is required'],
      [{ StartDate: '01/09/2026' }, 'StartDate is required'],
      [{ StartDate: '2026-02-30' }, 'StartDate is required'],
      [{ StartDate: '2026-09-18' }, 'StartDate cannot be in the future'],
      [{ StartDate: '2026-09-01', EndDate: 'soon' }, 'EndDate must be'],
      [{ StartDate: '2026-09-10', EndDate: '2026-09-01' }, 'EndDate cannot be earlier'],
    ])('rejects %j', (data, message) => {
      expect(() => parseManualBackfillRange(data, TODAY)).toThrow(message);
    });
  });

  describe('splitBackfillRange', () => {
    it('keeps a full calendar month as a single chunk', () => {
      expect(splitBackfillRange({ startDate: '2026-07-01', endDate: '2026-07-31' })).toEqual([
        { StartDate: '2026-07-01', EndDate: '2026-07-31' },
      ]);
      expect(splitBackfillRange({ startDate: '2028-02-01', endDate: '2028-02-29' })).toHaveLength(
        1
      );
    });

    it('splits 32 days into 31 + 1 and 63 days into three chunks', () => {
      expect(splitBackfillRange({ startDate: '2026-07-01', endDate: '2026-08-01' })).toEqual([
        { StartDate: '2026-07-01', EndDate: '2026-07-31' },
        { StartDate: '2026-08-01', EndDate: '2026-08-01' },
      ]);
      expect(splitBackfillRange({ startDate: '2026-07-01', endDate: '2026-09-01' })).toEqual([
        { StartDate: '2026-07-01', EndDate: '2026-07-31' },
        { StartDate: '2026-08-01', EndDate: '2026-08-31' },
        { StartDate: '2026-09-01', EndDate: '2026-09-01' },
      ]);
    });

    it('counts inclusive days', () => {
      expect(countBackfillDays({ startDate: '2026-07-01', endDate: '2026-07-01' })).toBe(1);
      expect(countBackfillDays({ startDate: '2026-07-01', endDate: '2026-09-01' })).toBe(63);
    });
  });

  describe('prepareManualBackfillPayload', () => {
    it('passes through incremental payloads and undefined', () => {
      const incremental = { runType: 'INCREMENTAL' };
      expect(prepareManualBackfillPayload(incremental, TODAY)).toBe(incremental);
      expect(prepareManualBackfillPayload(undefined, TODAY)).toBeUndefined();
    });

    it('normalizes a single-chunk range without attaching a chain', () => {
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

    it('narrows data to the first chunk and attaches the chain for long ranges', () => {
      expect(
        prepareManualBackfillPayload(
          { runType: 'MANUAL_BACKFILL', data: { StartDate: '2026-06-01', EndDate: '2026-09-15' } },
          TODAY
        )
      ).toEqual({
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-06-01', EndDate: '2026-07-01' },
        backfillChain: {
          startDate: '2026-06-01',
          endDate: '2026-09-15',
          chunkIndex: 0,
          totalChunks: 4,
        },
      });
    });

    it('passes through a payload that already carries a valid chain', () => {
      const chained = {
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-07-02', EndDate: '2026-08-01' },
        backfillChain: {
          startDate: '2026-06-01',
          endDate: '2026-09-15',
          chunkIndex: 1,
          totalChunks: 4,
        },
      };
      expect(prepareManualBackfillPayload(chained, TODAY)).toBe(chained);
    });

    it('rejects a malformed or out-of-range chain', () => {
      expect(() =>
        readBackfillChain({ backfillChain: { startDate: '2026-06-01', chunkIndex: 0 } })
      ).toThrow('Invalid backfill chain');
      expect(() =>
        readBackfillChain({
          backfillChain: {
            startDate: '2026-06-01',
            endDate: '2026-09-15',
            chunkIndex: 4,
            totalChunks: 4,
          },
        })
      ).toThrow('out of range');
    });
  });

  describe('buildNextBackfillChunkPayload', () => {
    const chain = { startDate: '2026-06-01', endDate: '2026-09-15', totalChunks: 4 };

    it('returns the following chunk with other data fields preserved', () => {
      expect(
        buildNextBackfillChunkPayload({
          runType: 'MANUAL_BACKFILL',
          data: { StartDate: '2026-06-01', EndDate: '2026-07-01', AccountId: '42' },
          backfillChain: { ...chain, chunkIndex: 0 },
        })
      ).toEqual({
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-07-02', EndDate: '2026-08-01', AccountId: '42' },
        backfillChain: { ...chain, chunkIndex: 1 },
      });
    });

    it('returns undefined after the last chunk and for payloads without a chain', () => {
      expect(
        buildNextBackfillChunkPayload({
          runType: 'MANUAL_BACKFILL',
          data: {},
          backfillChain: { ...chain, chunkIndex: 3 },
        })
      ).toBeUndefined();
      expect(
        buildNextBackfillChunkPayload({ runType: 'MANUAL_BACKFILL', data: {} })
      ).toBeUndefined();
      expect(buildNextBackfillChunkPayload(null)).toBeUndefined();
    });
  });
});
