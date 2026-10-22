import { describe, expect, it } from 'vitest';
import { formatDateShort } from '../../utils/date-formatters';
import { lastRunSummary } from './scheduleLabels';

const lastRun = (over: Partial<NonNullable<Parameters<typeof lastRunSummary>[0]>> = {}) => ({
  executionId: 'e1',
  status: 'SUCCEEDED',
  errorCode: null,
  finishedAt: null,
  ...over,
});

describe('lastRunSummary', () => {
  it('reads the status alone for a run that has not finished', () => {
    expect(lastRunSummary(lastRun({ status: 'RUNNING' }), 'UTC')).toBe('Running');
  });

  it('puts the error code in parentheses', () => {
    expect(lastRunSummary(lastRun({ status: 'FAILED', errorCode: 'TIMEOUT' }), 'UTC')).toBe(
      'Failed (TIMEOUT)'
    );
  });

  it('shows the finish time in the schedule zone', () => {
    const finishedAt = '2026-10-17T10:00:00.000Z';
    const when = formatDateShort(finishedAt, { timeZone: 'Asia/Tokyo' });

    expect(lastRunSummary(lastRun({ finishedAt }), 'Asia/Tokyo')).toBe(`Succeeded · ${when}`);
    expect(when).not.toBe(formatDateShort(finishedAt, { timeZone: 'America/New_York' }));
  });

  it('falls back to the raw value for a status it does not know', () => {
    expect(lastRunSummary(lastRun({ status: 'PAUSING' }), 'UTC')).toBe('PAUSING');
  });
});
