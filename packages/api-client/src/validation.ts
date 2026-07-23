const RFC3339_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

export type UserProjectionShape = {
  userId: string;
  fullName?: string | null;
  email?: string | null;
  avatar?: string | null;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalNullableEmail(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && /^[^\s@]+@[^\s@]+$/.test(value))
  );
}

function isOptionalNullableUri(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }

  try {
    return new URL(value).protocol.length > 1;
  } catch {
    return false;
  }
}

export function isUserProjection(value: unknown): value is UserProjectionShape {
  return (
    isRecord(value) &&
    typeof value.userId === 'string' &&
    isOptionalNullableString(value.fullName) &&
    isOptionalNullableEmail(value.email) &&
    isOptionalNullableUri(value.avatar)
  );
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function isRfc3339DateTimeString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const match = RFC3339_DATE_TIME.exec(value);
  if (!match) {
    return false;
  }

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = Number(secondValue);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const daysInSelectedMonth = daysInMonth[month - 1];

  return (
    month >= 1 &&
    month <= 12 &&
    daysInSelectedMonth !== undefined &&
    day >= 1 &&
    day <= daysInSelectedMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}
