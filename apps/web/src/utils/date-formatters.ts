/**
 * Shared date formatting utilities using Intl.DateTimeFormat
 * for consistent date/time display across the application
 */

/**
 * Format a date as a short, readable string (e.g., "Mar 15, 2024, 02:30 PM")
 * Uses browser's timezone for display
 */
export const formatDateShort = (date: Date | string | null): string => {
  if (!date) return '—';

  let d: Date;
  if (typeof date === 'string') {
    d = new Date(date);
    if (isNaN(d.getTime())) return '—';
  } else {
    d = date;
    if (isNaN(d.getTime())) return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

/**
 * Format a date as a full timestamp string (e.g., "2024-03-15 14:30:00")
 * Uses browser's timezone for display
 * Inspired by timezone.service.ts approach with Intl.DateTimeFormat
 */
export const formatDateTime = (date: Date | string | null): string => {
  if (!date) return '—';

  let d: Date;
  if (typeof date === 'string') {
    d = new Date(date);
    if (isNaN(d.getTime())) return '—';
  } else {
    d = date;
    if (isNaN(d.getTime())) return '—';
  }

  // Use Intl.DateTimeFormat to format in browser's timezone
  // This approach is similar to timezone.service.ts
  const formatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Use formatToParts for precise control over formatting
  const parts = formatter.formatToParts(d);
  const partsMap = new Map(parts.map(part => [part.type, part.value]));

  // Build the formatted string with guaranteed values
  const year = partsMap.get('year') ?? '';
  const month = partsMap.get('month') ?? '';
  const day = partsMap.get('day') ?? '';
  const hour = partsMap.get('hour') ?? '';
  const minute = partsMap.get('minute') ?? '';
  const second = partsMap.get('second') ?? '';

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

/**
 * Format a date with a specific timezone
 * Useful when you need to display time in a timezone different from the browser's
 *
 * @param date - Date to format
 * @param timeZone - IANA timezone identifier (e.g., 'America/New_York', 'Europe/London')
 * @returns Formatted string in the specified timezone
 *
 * @example
 * formatDateTimeWithTimezone(new Date(), 'America/New_York') // "2024-03-15 14:30:00"
 */
export const formatDateTimeWithTimezone = (
  date: Date | string | null,
  timeZone: string
): string => {
  if (!date) return '—';

  let d: Date;
  if (typeof date === 'string') {
    d = new Date(date);
    if (isNaN(d.getTime())) return '—';
  } else {
    d = date;
    if (isNaN(d.getTime())) return '—';
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone,
    });

    const parts = formatter.formatToParts(d);
    const partsMap = new Map(parts.map(part => [part.type, part.value]));

    const year = partsMap.get('year') ?? '';
    const month = partsMap.get('month') ?? '';
    const day = partsMap.get('day') ?? '';
    const hour = partsMap.get('hour') ?? '';
    const minute = partsMap.get('minute') ?? '';
    const second = partsMap.get('second') ?? '';

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  } catch (error) {
    console.warn(`Failed to format date with timezone ${timeZone}:`, error);
    // Fallback to browser timezone
    return formatDateTime(d);
  }
};

/**
 * Format timestamp string to display format
 * Parses the timestamp and formats it in browser's local timezone
 */
export const formatTimestamp = (timestamp: string): string => {
  return formatDateTime(parseDate(timestamp).toISOString());
};

/**
 * Parse a date string from various formats into a Date object
 * Handles multiple input formats commonly found in logs
 * Dates without timezone info are interpreted as UTC
 */
export const parseDate = (dateString: string): Date => {
  const cleaned = dateString.trim();

  // Try ISO format first (most common, most reliable)
  if (cleaned.includes('T') || cleaned.includes('Z')) {
    const date = new Date(cleaned);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Format: YYYY-MM-DD HH:mm:ss or YYYY/MM/DD HH:mm:ss - interpret as UTC
  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(
    cleaned
  );
  if (match) {
    // Parse as UTC by using Date.UTC
    return new Date(
      Date.UTC(
        parseInt(match[1], 10),
        parseInt(match[2], 10) - 1, // month is 0-indexed
        parseInt(match[3], 10),
        parseInt(match[4], 10),
        parseInt(match[5], 10),
        match[6] ? parseInt(match[6], 10) : 0
      )
    );
  }

  // Format: DD.MM.YYYY HH:mm or DD/MM/YYYY HH:mm - interpret as UTC
  match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(cleaned);
  if (match) {
    return new Date(
      Date.UTC(
        parseInt(match[3], 10),
        parseInt(match[2], 10) - 1, // month is 0-indexed
        parseInt(match[1], 10),
        parseInt(match[4], 10),
        parseInt(match[5], 10),
        match[6] ? parseInt(match[6], 10) : 0
      )
    );
  }

  // Fallback: try native Date parsing
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Last resort: return current date
  console.warn(`Failed to parse date string: "${dateString}", using current date as fallback`);
  return new Date();
};

export const formatDuration = (startedAt: Date, finishedAt: Date): string => {
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${String(hours)} h`);
  }
  if (remainingMinutes > 0) {
    parts.push(`${String(remainingMinutes)} min`);
  }
  parts.push(`${String(remainingSeconds)} sec`);

  return parts.join(' ');
};
