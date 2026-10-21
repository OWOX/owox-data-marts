import { describe, expect, it } from 'vitest';
import { formatDateShort, formatDuration } from './date-formatters';

describe('formatDuration', () => {
  it('formats a positive duration as hours/minutes/seconds', () => {
    const start = new Date('2026-05-14T00:00:00.000Z');
    const end = new Date('2026-05-14T00:02:03.000Z');
    expect(formatDuration(start, end)).toBe('2 min 3 sec');
  });

  it('clamps to 0 sec when finishedAt is before startedAt (clock skew)', () => {
    const start = new Date('2026-05-14T00:00:10.000Z');
    const end = new Date('2026-05-14T00:00:08.000Z');
    expect(formatDuration(start, end)).toBe('0 sec');
  });
});

describe('formatDateShort', () => {
  it('formats in the given zone and names it, whatever zone the runner is in', () => {
    // 06:00 UTC is 09:00 in Kyiv on 17 Oct 2026 (UTC+3).
    expect(formatDateShort('2026-10-17T06:00:00.000Z', { timeZone: 'Europe/Kyiv' })).toBe(
      'Oct 17, 2026, 09:00 AM GMT+3'
    );
  });

  it('names winter time in the given zone', () => {
    expect(formatDateShort('2026-12-17T07:00:00.000Z', { timeZone: 'Europe/Kyiv' })).toBe(
      'Dec 17, 2026, 09:00 AM GMT+2'
    );
  });

  it('falls back to the browser zone, unnamed, for a zone Intl refuses', () => {
    const date = '2026-12-17T07:00:00.000Z';

    expect(formatDateShort(date, { timeZone: 'Not/AZone' })).toBe(formatDateShort(date));
  });
});
