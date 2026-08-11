import { validate } from 'class-validator';
import { RunDataMartRequestApiDto } from './run-data-mart-request-api.dto';

/**
 * The connector engine reads "today" as UTC midnight (AbstractConnector._formatDate feeds
 * toISOString() into _parseDate), so the bounds this spec builds have to be UTC too --
 * a local-date helper would call today "the future" for anyone east of Greenwich.
 */
const utcDay = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().split('T')[0];

describe('RunDataMartRequestApiDto', () => {
  it('rejects a primitive payload that cannot satisfy the documented object contract', async () => {
    const dto = Object.assign(new RunDataMartRequestApiDto(), { payload: 'not-an-object' });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'payload',
          constraints: expect.objectContaining({ isObject: expect.any(String) }),
        }),
      ])
    );
  });

  it('rejects an explicit null payload instead of treating it as omitted', async () => {
    const dto = Object.assign(new RunDataMartRequestApiDto(), { payload: null });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'payload',
          constraints: expect.objectContaining({ isObject: expect.any(String) }),
        }),
      ])
    );
  });

  it('rejects a payload larger than the documented one-megabyte limit', async () => {
    const dto = Object.assign(new RunDataMartRequestApiDto(), {
      payload: { value: 'x'.repeat(1024 * 1024) },
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'payload',
          constraints: expect.objectContaining({ maxJsonSize: expect.any(String) }),
        }),
      ])
    );
  });

  it.each([
    { runType: 'FULL_REFRESH' },
    { runType: 'MANUAL_BACKFILL', data: [] },
    { runType: 'INCREMENTAL', typo: true },
  ])('rejects a payload whose run type and data do not form a supported pair', async payload => {
    const dto = Object.assign(new RunDataMartRequestApiDto(), { payload });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'payload',
          constraints: expect.objectContaining({ isRunDataMartPayload: expect.any(String) }),
        }),
      ])
    );
  });

  it('accepts explicit manual-backfill data', async () => {
    const dto = Object.assign(new RunDataMartRequestApiDto(), {
      payload: {
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-07-01', EndDate: '2026-07-31' },
      },
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it.each([
    { runType: 'INCREMENTAL', data: { StartDate: '2026-07-01' } },
    { runType: 'MANUAL_BACKFILL' },
  ])('accepts connector payload variants produced by the existing run form', async payload => {
    const dto = Object.assign(new RunDataMartRequestApiDto(), { payload });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  // The backfill window is checked here so a typo comes back as a 400 rather than as a run
  // that fails minutes later. The rules mirror AbstractConnector._getManualBackfillDateRange
  // exactly -- the engine stays the source of truth for the window it will actually use.
  describe('manual-backfill window', () => {
    it.each([
      { case: 'plain calendar dates', data: { StartDate: '2026-07-01', EndDate: '2026-07-31' } },
      {
        case: 'ISO-8601 timestamps',
        data: { StartDate: '2026-07-01T00:00:00.000Z', EndDate: '2026-07-31T23:59:59Z' },
      },
      { case: 'unpadded month and day', data: { StartDate: '2026-7-1', EndDate: '2026-7-31' } },
      { case: 'a single-day window ending today', data: { StartDate: utcDay(0) } },
      // _getManualBackfillDateRange logs a warning and clamps a future EndDate to today
      // instead of failing, so the request must not be rejected either.
      {
        case: 'an EndDate the engine clamps to today',
        data: { StartDate: '2026-07-01', EndDate: utcDay(3) },
      },
      { case: 'only an EndDate', data: { EndDate: '2026-07-31' } },
      { case: 'no window at all', data: {} },
    ])('accepts $case', async ({ data }) => {
      const dto = Object.assign(new RunDataMartRequestApiDto(), {
        payload: { runType: 'MANUAL_BACKFILL', data },
      });

      await expect(validate(dto)).resolves.toEqual([]);
    });

    it('accepts a window alongside the connector-specific fields it travels with', async () => {
      const dto = Object.assign(new RunDataMartRequestApiDto(), {
        payload: {
          runType: 'MANUAL_BACKFILL',
          data: {
            StartDate: '2026-07-01',
            EndDate: '2026-07-31',
            AccountIDs: ['act_123', 'act_456'],
            Fields: { campaign: ['id', 'name'] },
          },
        },
      });

      await expect(validate(dto)).resolves.toEqual([]);
    });

    it.each([
      { case: 'a word where a date belongs', data: { StartDate: 'yesterday' } },
      { case: 'a US-ordered date', data: { StartDate: '01/15/2026' } },
      { case: 'a two-digit year', data: { StartDate: '26-07-01' } },
      { case: 'an unreadable EndDate', data: { StartDate: '2026-07-01', EndDate: 'not-a-date' } },
      { case: 'a boolean', data: { StartDate: true } },
      { case: 'a wrapped value', data: { StartDate: { value: '2026-07-01' } } },
      {
        case: 'an EndDate before the StartDate',
        data: { StartDate: '2026-07-31', EndDate: '2026-07-01' },
      },
      { case: 'a StartDate in the future', data: { StartDate: utcDay(2) } },
      {
        case: 'a whole window in the future',
        data: { StartDate: utcDay(2), EndDate: utcDay(3) },
      },
    ])('rejects $case', async ({ data }) => {
      const dto = Object.assign(new RunDataMartRequestApiDto(), {
        payload: { runType: 'MANUAL_BACKFILL', data },
      });

      await expect(validate(dto)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            property: 'payload',
            constraints: expect.objectContaining({
              isManualBackfillDateRange: expect.any(String),
            }),
          }),
        ])
      );
    });

    it('names the offending field and value so the caller can fix it', async () => {
      const dto = Object.assign(new RunDataMartRequestApiDto(), {
        payload: { runType: 'MANUAL_BACKFILL', data: { StartDate: 'yesterday' } },
      });

      const [error] = await validate(dto);
      expect(error.constraints?.isManualBackfillDateRange).toContain('StartDate (yesterday)');
    });

    // Only MANUAL_BACKFILL reads StartDate/EndDate out of data; an incremental run derives
    // its own window, so the same keys there are just connector-specific fields.
    it.each([
      { runType: 'INCREMENTAL', data: { StartDate: 'not-a-date' } },
      { runType: 'INCREMENTAL', data: { StartDate: '2026-07-31', EndDate: '2026-07-01' } },
      { data: { StartDate: utcDay(30) } },
    ])('leaves a non-backfill run alone', async payload => {
      const dto = Object.assign(new RunDataMartRequestApiDto(), { payload });

      await expect(validate(dto)).resolves.toEqual([]);
    });
  });
});
