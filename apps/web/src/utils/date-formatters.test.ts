import { describe, expect, it } from 'vitest';
import { formatDuration } from './date-formatters';

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
