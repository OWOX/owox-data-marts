import { athenaTimestampToIsoUtc } from './athena-timestamp.utils';

describe('athenaTimestampToIsoUtc', () => {
  it('converts the varchar shape Athena prints for timestamp with time zone', () => {
    expect(athenaTimestampToIsoUtc('2026-08-12 10:00:00.123 UTC')).toBe('2026-08-12T10:00:00.123Z');
  });

  it('converts timestamps without a fraction or zone suffix', () => {
    expect(athenaTimestampToIsoUtc('2026-08-12 10:00:00')).toBe('2026-08-12T10:00:00.000Z');
  });

  it('returns null for unparseable values and non-UTC zones', () => {
    expect(athenaTimestampToIsoUtc(null)).toBeNull();
    expect(athenaTimestampToIsoUtc('')).toBeNull();
    expect(athenaTimestampToIsoUtc('not a timestamp')).toBeNull();
    expect(athenaTimestampToIsoUtc('2026-08-12 10:00:00 Europe/Kyiv')).toBeNull();
  });
});
