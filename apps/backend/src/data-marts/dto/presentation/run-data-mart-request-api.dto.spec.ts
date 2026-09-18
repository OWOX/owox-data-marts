import { validate } from 'class-validator';
import { RunDataMartRequestApiDto } from './run-data-mart-request-api.dto';

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
});
