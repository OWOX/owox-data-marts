import { cronToScheduleConfig } from '../components/ScheduleConfig/cron-parser';

export interface ScheduleConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'interval' | 'custom';
  time: string;
  weekdays: number[];
  monthDays: number[];
  customCron: string;
  intervalType: 'minutes' | 'hours';
  intervalValue: number;
  timezone: string;
}

export const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

export const getBrowserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

export function getScheduleDescription(config: ScheduleConfig, isEnabled: boolean): string {
  if (!isEnabled) return 'Schedule is disabled';

  const timeStr = config.time;

  switch (config.type) {
    case 'daily':
      return `Daily at ${timeStr}`;
    case 'weekly': {
      const selectedDays = config.weekdays
        .map(day => WEEKDAYS.find(w => w.value === day)?.label)
        .join(', ');
      return `Weekly on ${selectedDays} at ${timeStr}`;
    }
    case 'monthly': {
      const sortedDays = [...config.monthDays].sort((a, b) => a - b);
      const dayStrings = sortedDays.map(day => {
        if (day === 1) return '1st';
        if (day === 2) return '2nd';
        if (day === 3) return '3rd';
        return `${String(day)}th`;
      });
      const daysText =
        dayStrings.length === 1
          ? dayStrings[0]
          : dayStrings.length === 2
            ? `${dayStrings[0]} and ${dayStrings[1]}`
            : `${dayStrings.slice(0, -1).join(', ')}, and ${dayStrings[dayStrings.length - 1]}`;
      return `Monthly on the ${daysText} at ${timeStr}`;
    }
    case 'interval':
      return config.intervalType === 'minutes'
        ? `Every ${String(config.intervalValue)} minute${config.intervalValue !== 1 ? 's' : ''}`
        : `Every ${String(config.intervalValue)} hour${config.intervalValue !== 1 ? 's' : ''}`;
    case 'custom':
      return `Custom schedule`;
    default:
      return '';
  }
}

export function parseScheduleFromCron(
  cronExpression: string,
  timeZone: string,
  isEnabled = true
): string {
  const config = cronToScheduleConfig(cronExpression, timeZone);
  return getScheduleDescription(config, isEnabled);
}
