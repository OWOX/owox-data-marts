import { describe, expect, it } from 'vitest';
import type { ScheduleConfig } from '../../utils/schedule-utils';
import { cronToScheduleConfig, scheduleConfigToCron } from './cron-parser';

const config = (over: Partial<ScheduleConfig>): ScheduleConfig => ({
  ...cronToScheduleConfig('0 9 * * *'),
  ...over,
});

describe('scheduleConfigToCron', () => {
  it.each([
    ['daily', config({ type: 'daily', time: '09:05' }), '5 9 * * *'],
    [
      'weekly on two days',
      config({ type: 'weekly', time: '18:30', weekdays: [1, 4] }),
      '30 18 * * 1,4',
    ],
    ['monthly', config({ type: 'monthly', time: '06:00', monthDays: [1, 15] }), '0 6 1,15 * *'],
    [
      'every 15 minutes',
      config({ type: 'interval', intervalType: 'minutes', intervalValue: 15 }),
      '*/15 * * * *',
    ],
    [
      'every 2 hours',
      config({ type: 'interval', intervalType: 'hours', intervalValue: 2 }),
      '0 */2 * * *',
    ],
  ])('writes %s and reads it back as the same schedule', (_name, source, cron) => {
    expect(scheduleConfigToCron(source)).toBe(cron);

    const back = cronToScheduleConfig(cron);
    expect(back.type).toBe(source.type);
    expect(scheduleConfigToCron({ ...source, ...back })).toBe(cron);
  });
});
