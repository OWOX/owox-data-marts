import { describe, expect, it } from 'vitest';
import { describeCron } from './describeCron';

describe('describeCron', () => {
  it.each([
    ['0 9 * * *', 'Daily at 09:00'],
    [' 0  9 * * * ', 'Daily at 09:00'],
    ['0 9 * * 1,3', 'Weekly on Monday, Wednesday at 09:00'],
    ['0 9 1 * *', 'Monthly on the 1st at 09:00'],
    ['*/15 * * * *', 'Every 15 minutes'],
    ['0 */2 * * *', 'Every 2 hours'],
  ])('describes %j', (cron, summary) => {
    expect(describeCron(cron)).toBe(summary);
  });

  it.each([
    '0 9 * * 1-5',
    '0 9,18 * * *',
    '30 9-17 * * *',
    '*/90 * * * *',
    '0 */5 * * *',
    '*/10 * * * * *',
    '@hourly',
    '0 0 29 2 1',
  ])('leaves %j undescribed', cron => {
    expect(describeCron(cron)).toBeNull();
  });
});
