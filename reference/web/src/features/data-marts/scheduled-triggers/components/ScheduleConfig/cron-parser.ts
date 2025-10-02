export interface ParsedCron {
  minute: string;
  hour: string;
  day: string;
  month: string;
  dayOfWeek: string;
}

export function parseCronExpression(cronExpression: string): ParsedCron | null {
  const parts = cronExpression.trim().split(/\s+/);

  if (parts.length !== 5) {
    return null;
  }

  return {
    minute: parts[0],
    hour: parts[1],
    day: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

export function cronToScheduleConfig(cronExpression: string, timezone = 'UTC') {
  const parsed = parseCronExpression(cronExpression);

  if (!parsed) {
    return {
      type: 'daily' as const,
      time: '09:00',
      weekdays: [1, 2, 3, 4, 5],
      monthDays: [1],
      customCron: cronExpression,
      intervalType: 'minutes' as const,
      intervalValue: 15,
      timezone,
    };
  }

  const { minute, hour, day, month, dayOfWeek } = parsed;

  // Check for interval patterns
  if (
    minute.startsWith('*/') &&
    hour === '*' &&
    day === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    const intervalValue = Number.parseInt(minute.substring(2));
    if (!isNaN(intervalValue)) {
      return {
        type: 'interval' as const,
        time: '09:00',
        weekdays: [1, 2, 3, 4, 5],
        monthDays: [1],
        customCron: cronExpression,
        intervalType: 'minutes' as const,
        intervalValue,
        timezone,
      };
    }
  }

  if (
    minute !== '*' &&
    hour.startsWith('*/') &&
    day === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    const intervalValue = Number.parseInt(hour.substring(2));
    if (!isNaN(intervalValue) && minute === '0') {
      return {
        type: 'interval' as const,
        time: '09:00',
        weekdays: [1, 2, 3, 4, 5],
        monthDays: [1],
        customCron: cronExpression,
        intervalType: 'hours' as const,
        intervalValue,
        timezone,
      };
    }
  }

  // Parse time from minute and hour
  const minuteNum = Number.parseInt(minute);
  const hourNum = Number.parseInt(hour);
  const time =
    !isNaN(minuteNum) && !isNaN(hourNum)
      ? `${hourNum.toString().padStart(2, '0')}:${minuteNum.toString().padStart(2, '0')}`
      : '09:00';

  // Check for daily pattern
  if (!isNaN(minuteNum) && !isNaN(hourNum) && day === '*' && month === '*' && dayOfWeek === '*') {
    return {
      type: 'daily' as const,
      time,
      weekdays: [1, 2, 3, 4, 5],
      monthDays: [1],
      customCron: cronExpression,
      intervalType: 'minutes' as const,
      intervalValue: 15,
      timezone,
    };
  }

  // Check for weekly pattern
  if (!isNaN(minuteNum) && !isNaN(hourNum) && day === '*' && month === '*' && dayOfWeek !== '*') {
    const weekdays = dayOfWeek
      .split(',')
      .map(d => Number.parseInt(d.trim()))
      .filter(d => !isNaN(d) && d >= 0 && d <= 6);
    if (weekdays.length > 0) {
      return {
        type: 'weekly' as const,
        time,
        weekdays,
        monthDays: [1],
        customCron: cronExpression,
        intervalType: 'minutes' as const,
        intervalValue: 15,
        timezone,
      };
    }
  }

  // Check for monthly pattern
  if (!isNaN(minuteNum) && !isNaN(hourNum) && day !== '*' && month === '*' && dayOfWeek === '*') {
    const monthDays = day
      .split(',')
      .map(d => Number.parseInt(d.trim()))
      .filter(d => !isNaN(d) && d >= 1 && d <= 31);
    if (monthDays.length > 0) {
      return {
        type: 'monthly' as const,
        time,
        weekdays: [1, 2, 3, 4, 5],
        monthDays,
        customCron: cronExpression,
        intervalType: 'minutes' as const,
        intervalValue: 15,
        timezone,
      };
    }
  }

  // If we can't parse it, treat as custom
  return {
    type: 'custom' as const,
    time: '09:00',
    weekdays: [1, 2, 3, 4, 5],
    monthDays: [1],
    customCron: cronExpression,
    intervalType: 'minutes' as const,
    intervalValue: 15,
    timezone,
  };
}
