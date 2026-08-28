/**
 * Interface for timezone data with offset information
 */
interface TimezoneData {
  /**
   * Timezone identifier (e.g., 'Europe/London')
   */
  identifier: string;

  /**
   * Human-readable display name
   */
  displayName: string;

  /**
   * Current UTC offset in minutes
   */
  offsetMinutes: number;

  /**
   * Current UTC offset as string (e.g., '+02:00')
   */
  offsetString: string;

  /**
   * Whether the timezone is currently in DST
   */
  isDST: boolean;
}

const UTC_TIMEZONE = 'UTC';
const UTC_TIMEZONE_ALIASES = new Set(['UTC', 'Etc/UTC', 'GMT', 'Etc/GMT']);
const TIMEZONE_DISPLAY_NAME_OVERRIDES = new Map([['Europe/Kiev', 'Europe/Kyiv']]);

/**
 * Service for providing timezone data.
 * Currently returns a fixed list of timezones from Intl.supportedValuesOf('timeZone'),
 * but can be updated in the future to fetch from an API.
 */
class TimezoneService {
  /**
   * Get a list of all available timezones.
   * @returns {string[]} Array of timezone identifiers
   */
  getTimezones(): string[] {
    // Currently using the browser's Intl API to get supported timezones
    // This could be replaced with an API call in the future
    const runtimeTimezones = Intl.supportedValuesOf('timeZone').filter(
      timezone => !UTC_TIMEZONE_ALIASES.has(timezone)
    );

    return [UTC_TIMEZONE, ...runtimeTimezones];
  }

  /**
   * Get detailed timezone information including offset
   * @returns {TimezoneData[]} Array of timezone data with offset information
   */
  getTimezonesWithOffset(): TimezoneData[] {
    const timezones = this.getTimezones();
    const now = new Date();

    return timezones.map(timezone => {
      const offsetMinutes = this.getTimezoneOffset(timezone, now);
      const offsetString = this.formatOffset(offsetMinutes);
      const isDST = this.isDaylightSavingTime(timezone, now);

      // Create a more readable display name
      const displayName = this.getDisplayName(timezone, offsetString);

      return {
        identifier: timezone,
        displayName,
        offsetMinutes,
        offsetString,
        isDST,
      };
    });
  }

  /**
   * Get timezone offset in minutes for a specific timezone
   * @param timezone - Timezone identifier (e.g., 'Europe/London')
   * @param date - Date to check (optional, defaults to now)
   * @returns {number} Offset in minutes from UTC
   */
  getTimezoneOffset(timezone: string, date: Date = new Date()): number {
    if (UTC_TIMEZONE_ALIASES.has(timezone)) {
      return 0;
    }

    try {
      // Create date formatters for UTC and target timezone
      const utcFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const timezoneFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const utcTime = new Date(utcFormatter.format(date));
      const timezoneTime = new Date(timezoneFormatter.format(date));

      // Calculate difference in minutes
      return Math.round((timezoneTime.getTime() - utcTime.getTime()) / (1000 * 60));
    } catch (error) {
      console.warn(`Failed to get offset for timezone ${timezone}:`, error);
      return 0;
    }
  }

  /**
   * Format offset in minutes to string format (+HH:MM)
   * @param offsetMinutes - Offset in minutes
   * @returns {string} Formatted offset string
   */
  formatOffset(offsetMinutes: number): string {
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const hours = Math.floor(absOffset / 60);
    const minutes = absOffset % 60;

    return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Get the user-facing name for a stored timezone identifier.
   * @param timezone - Stored timezone identifier
   * @returns {string} User-facing timezone name
   */
  getTimezoneDisplayName(timezone: string): string {
    return TIMEZONE_DISPLAY_NAME_OVERRIDES.get(timezone) ?? timezone;
  }

  /**
   * Check if a timezone is currently in daylight saving time
   * @param timezone - Timezone identifier
   * @param date - Date to check (optional, defaults to now)
   * @returns {boolean} Whether timezone is in DST
   */
  isDaylightSavingTime(timezone: string, date: Date = new Date()): boolean {
    if (UTC_TIMEZONE_ALIASES.has(timezone)) {
      return false;
    }

    try {
      const january = new Date(date.getFullYear(), 0, 1);
      const july = new Date(date.getFullYear(), 6, 1);

      const januaryOffset = this.getTimezoneOffset(timezone, january);
      const julyOffset = this.getTimezoneOffset(timezone, july);
      const currentOffset = this.getTimezoneOffset(timezone, date);

      // DST is active when current offset is greater than standard offset
      const standardOffset = Math.min(januaryOffset, julyOffset);
      return currentOffset > standardOffset;
    } catch (error) {
      console.warn(`Failed to check DST for timezone ${timezone}:`, error);
      return false;
    }
  }

  /**
   * Get human-readable display name for timezone
   * @param timezone - Timezone identifier
   * @param offsetString - Formatted offset string
   * @returns {string} Display name
   */
  private getDisplayName(timezone: string, offsetString: string): string {
    if (timezone === UTC_TIMEZONE) {
      return `${UTC_TIMEZONE} (${offsetString}, no DST)`;
    }

    const displayTimezone = this.getTimezoneDisplayName(timezone);
    return `${displayTimezone} (${offsetString})`;
  }

  /**
   * Get current browser timezone information
   * @returns {TimezoneData} Browser timezone data
   */
  getBrowserTimezone(): TimezoneData {
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();

    const offsetMinutes = this.getTimezoneOffset(browserTimezone, now);
    const offsetString = this.formatOffset(offsetMinutes);
    const isDST = this.isDaylightSavingTime(browserTimezone, now);
    const displayName = this.getDisplayName(browserTimezone, offsetString);

    return {
      identifier: browserTimezone,
      displayName,
      offsetMinutes,
      offsetString,
      isDST,
    };
  }

  /**
   * Get browser offset in minutes (shortcut method)
   * @returns {number} Browser timezone offset in minutes
   */
  getBrowserOffset(): number {
    // Also can use native method: -new Date().getTimezoneOffset()
    return this.getBrowserTimezone().offsetMinutes;
  }
}

// Export a singleton instance of the service
export const timezoneService = new TimezoneService();
