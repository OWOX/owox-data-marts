import { redshiftTimestampToIsoUtc } from './redshift-timestamp.utils';

describe('redshiftTimestampToIsoUtc', () => {
  it('converts the microsecond shape SHOW TABLES actually returns', () => {
    expect(redshiftTimestampToIsoUtc('2025-11-18 15:44:34.856073')).toBe(
      '2025-11-18T15:44:34.856Z'
    );
  });

  it('converts a timestamp without a fractional part', () => {
    expect(redshiftTimestampToIsoUtc('2025-11-18 15:44:34')).toBe('2025-11-18T15:44:34.000Z');
  });

  it('pads short fractional parts to milliseconds', () => {
    expect(redshiftTimestampToIsoUtc('2025-11-18 15:44:34.8')).toBe('2025-11-18T15:44:34.800Z');
  });

  it('tolerates explicit UTC markers', () => {
    expect(redshiftTimestampToIsoUtc('2025-11-18 15:44:34+00')).toBe('2025-11-18T15:44:34.000Z');
    expect(redshiftTimestampToIsoUtc('2025-11-18T15:44:34.856073Z')).toBe(
      '2025-11-18T15:44:34.856Z'
    );
    expect(redshiftTimestampToIsoUtc('2025-11-18 15:44:34+00:00')).toBe('2025-11-18T15:44:34.000Z');
  });

  it('returns null for absent or unparseable values, including non-UTC offsets', () => {
    expect(redshiftTimestampToIsoUtc(null)).toBeNull();
    expect(redshiftTimestampToIsoUtc(undefined)).toBeNull();
    expect(redshiftTimestampToIsoUtc('')).toBeNull();
    expect(redshiftTimestampToIsoUtc('not a timestamp')).toBeNull();
    // A non-zero offset is NOT silently treated as UTC.
    expect(redshiftTimestampToIsoUtc('2025-11-18 15:44:34+02')).toBeNull();
  });
});
