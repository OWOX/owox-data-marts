import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  UNIQUE_COUNT_CONFIG_MAX_SOURCES,
  UniqueCountConfigRequestSchema,
  UniqueCountConfigSchema,
} from './unique-count-config.schema';
import { CreateReportRequestApiDto } from '../presentation/create-report-request-api.dto';
import { UpdateReportRequestApiDto } from '../presentation/update-report-request-api.dto';

describe('UniqueCountConfigSchema', () => {
  it('accepts true', () => {
    const result = UniqueCountConfigSchema.safeParse(true);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe(true);
  });

  it('accepts false', () => {
    const result = UniqueCountConfigSchema.safeParse(false);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe(false);
  });

  it('accepts null', () => {
    const result = UniqueCountConfigSchema.safeParse(null);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBeNull();
  });

  it('rejects a non-boolean (string)', () => {
    const result = UniqueCountConfigSchema.safeParse('yes');
    expect(result.success).toBe(false);
  });

  it('rejects a non-boolean (number)', () => {
    const result = UniqueCountConfigSchema.safeParse(1);
    expect(result.success).toBe(false);
  });

  it('rejects an object', () => {
    const result = UniqueCountConfigSchema.safeParse({ enabled: true });
    expect(result.success).toBe(false);
  });

  // The entity transformer re-parses on READ as well as on write. Capping the STORED shape would
  // turn an over-cap row from unsavable into unreadable — the trap the request cap exists to avoid.
  it('does not cap the stored shape, so no persisted report can become unreadable', () => {
    const many = Array.from({ length: UNIQUE_COUNT_CONFIG_MAX_SOURCES + 1 }, (_, i) => `s${i}`);
    expect(UniqueCountConfigSchema.safeParse(many).success).toBe(true);
  });
});

describe('UniqueCountConfigRequestSchema source cap', () => {
  const sources = (n: number) => Array.from({ length: n }, (_, i) => `source_${i}`);

  it('accepts an array exactly at the cap', () => {
    const result = UniqueCountConfigRequestSchema.safeParse(
      sources(UNIQUE_COUNT_CONFIG_MAX_SOURCES)
    );
    expect(result.success).toBe(true);
  });

  it('rejects an array one entry over the cap', () => {
    const result = UniqueCountConfigRequestSchema.safeParse(
      sources(UNIQUE_COUNT_CONFIG_MAX_SOURCES + 1)
    );
    expect(result.success).toBe(false);
  });

  it('still accepts the legacy boolean and null forms', () => {
    expect(UniqueCountConfigRequestSchema.safeParse(true).success).toBe(true);
    expect(UniqueCountConfigRequestSchema.safeParse(false).success).toBe(true);
    expect(UniqueCountConfigRequestSchema.safeParse(null).success).toBe(true);
  });
});

describe('report request DTOs cap uniqueCountConfig', () => {
  const oversized = Array.from({ length: UNIQUE_COUNT_CONFIG_MAX_SOURCES + 1 }, (_, i) => `s${i}`);
  const base = {
    title: 'Report',
    dataDestinationId: 'dd1',
    destinationConfig: { type: 'GOOGLE_SHEETS' },
  };

  it.each([
    ['CreateReportRequestApiDto', CreateReportRequestApiDto],
    ['UpdateReportRequestApiDto', UpdateReportRequestApiDto],
  ])('%s rejects more sources than the cap', async (_name, DtoClass) => {
    const errors = await validate(
      plainToInstance(DtoClass, { ...base, uniqueCountConfig: oversized })
    );
    expect(errors.map(e => e.property)).toContain('uniqueCountConfig');
  });

  it.each([
    ['CreateReportRequestApiDto', CreateReportRequestApiDto],
    ['UpdateReportRequestApiDto', UpdateReportRequestApiDto],
  ])('%s accepts a realistic source list', async (_name, DtoClass) => {
    const errors = await validate(
      plainToInstance(DtoClass, { ...base, uniqueCountConfig: ['', 'orders', 'orders.items'] })
    );
    expect(errors.map(e => e.property)).not.toContain('uniqueCountConfig');
  });
});
